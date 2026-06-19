import json
import sys


def main():
    # Read stdin passed by the tool execution interceptor hook
    raw_input = sys.stdin.read().strip()
    if not raw_input:
        sys.exit(0)

    command_line = ""

    # Try parsing as JSON first
    try:
        data = json.loads(raw_input)
        command_line = (
            data.get("CommandLine")
            or data.get("command")
            or data.get("arguments", {}).get("CommandLine", "")
        )
        if not command_line and isinstance(data, str):
            command_line = data
    except json.JSONDecodeError:
        command_line = raw_input

    if not command_line:
        # Fallback to inspecting raw input directly if JSON structure doesn't match expected fields
        command_line = raw_input

    command_line_lower = command_line.lower().strip()

    # Destructive patterns definition
    blocked_keywords = ["rm -rf", "rm -f", "rm -r", "mkfs", "dd if=", "format c:"]

    # Check for blocked keywords
    for keyword in blocked_keywords:
        if keyword in command_line_lower:
            print(
                f"Error: Command execution blocked by secure coding hook. "
                f"Detected dangerous pattern '{keyword}' in command: '{command_line}'",
                file=sys.stderr,
            )
            sys.exit(1)

    # Extra check for dangerous rm options targeting system directories
    if "rm " in command_line_lower and (
        " /" in command_line_lower or " c:\\" in command_line_lower
    ):
        print(
            f"Error: Command execution blocked. Potential destructive root file deletion detected: '{command_line}'",
            file=sys.stderr,
        )
        sys.exit(1)

    print("Success: Command call passed validation.")
    sys.exit(0)


if __name__ == "__main__":
    main()
