#!/usr/bin/env python3
"""
Autonomous Newsletter Fleet background worker.
Runs the newsletter multi-agent pipeline at configured intervals.
Uses a time-loop scheduler (zero-dependency fallback) to run in the background.
"""

import os
import sys
import time
import json
import argparse
from datetime import datetime, timedelta
import threading

# Add current dir to path to import agent_pipeline
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from agent_pipeline import run_pipeline

STATUS_FILE = "background_worker_status.json"

class BackgroundWorker:
    def __init__(self, niche: str, model: str, interval_minutes: float, simulate: bool):
        self.niche = niche
        self.model = model
        self.interval_seconds = int(interval_minutes * 60)
        self.simulate = simulate
        self.is_running = False
        self.last_run_time = None
        self.next_run_time = None
        self._thread = None
        self._stop_event = threading.Event()

    def update_status_file(self, worker_state: str):
        status_data = {
            "status": worker_state,
            "last_run": self.last_run_time.isoformat() + "Z" if self.last_run_time else None,
            "next_run": self.next_run_time.isoformat() + "Z" if self.next_run_time else None,
            "interval_seconds": self.interval_seconds,
            "active_niche": self.niche,
            "model": self.model,
            "simulate": self.simulate,
            "pid": os.getpid()
        }
        try:
            with open(STATUS_FILE, "w", encoding="utf-8") as f:
                json.dump(status_data, f, indent=2)
        except Exception as e:
            print(f"⚠️ Failed to write worker status file: {e}")

    def run_cycle(self):
        print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] 🚀 Worker waking up: Triggering newsletter pipeline...")
        self.last_run_time = datetime.now()
        self.next_run_time = self.last_run_time + timedelta(seconds=self.interval_seconds)
        self.update_status_file("generating")

        try:
            # Set UTF-8 encoding environment variable programmatically
            os.environ["PYTHONIOENCODING"] = "utf-8"
            run_pipeline(niche=self.niche, model_name=self.model, simulate=self.simulate)
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] ✅ Pipeline execution finished successfully.")
        except Exception as e:
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] ❌ Pipeline failed: {e}")

        self.update_status_file("idle")
        print(f"💤 Sleeping. Next run at: {self.next_run_time.strftime('%Y-%m-%d %H:%M:%S')}")

    def _loop(self):
        self.is_running = True
        print(f"🤖 Fleet worker started in background thread. Interval: {self.interval_seconds}s")
        self.next_run_time = datetime.now()
        self.update_status_file("idle")

        while not self._stop_event.is_set():
            now = datetime.now()
            if now >= self.next_run_time:
                self.run_cycle()
            
            # Sleep in small increments to respond to stop events quickly
            time.sleep(1)
        
        self.is_running = False
        self.update_status_file("stopped")
        print("🤖 Fleet worker stopped.")

    def start(self):
        if self.is_running:
            print("⚠️ Worker is already running.")
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        print("🛑 Requesting fleet worker to stop...")
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fleet Background Worker")
    parser.add_argument("--niche", default="AI & Agentic Frameworks", help="Niche for the newsletter")
    parser.add_argument("--model", default="gemini-1.5-flash", help="Gemini model to use")
    parser.add_argument("--interval", type=float, default=5.0, help="Run interval in minutes (decimals allowed, e.g., 0.5)")
    parser.add_argument("--simulate", action="store_true", help="Run in simulation mode")
    args = parser.parse_args()

    # Create and run worker synchronously in the main thread for simplicity when run directly
    worker = BackgroundWorker(
        niche=args.niche,
        model=args.model,
        interval_minutes=args.interval,
        simulate=args.simulate
    )
    
    print("═" * 64)
    print("🤖 AUTONOMOUS NEWSLETTER BACKGROUND FLEET WORKER")
    print(f"   Niche   : {args.niche}")
    print(f"   Model   : {args.model}")
    print(f"   Interval: {args.interval} minutes ({worker.interval_seconds} seconds)")
    print(f"   Simulate: {args.simulate}")
    print("   Press Ctrl+C to terminate the background worker.")
    print("═" * 64)

    # Initial status save
    worker.last_run_time = None
    worker.next_run_time = datetime.now()
    worker.update_status_file("idle")

    try:
        while True:
            now = datetime.now()
            if now >= worker.next_run_time:
                worker.run_cycle()
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Terminating background worker...")
        worker.update_status_file("stopped")
        sys.exit(0)
