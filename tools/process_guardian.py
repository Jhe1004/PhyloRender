"""Independent native-job guardian. Parent pipe EOF also covers parent SIGKILL.

The engine owns a new process group; this helper never signals the web/MCP
service group or discovers/kills unrelated processes. Engine descendants must
not detach from their group (the bundled engines do not do so).
"""
import os
import select
import signal
import subprocess
import sys
import time


def terminate_group(process):
    def send(sig):
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            pass
    # Even a successful leader may have left a child holding files/CPU.
    send(signal.SIGTERM)
    deadline = time.monotonic() + .5
    while time.monotonic() < deadline:
        try:
            os.killpg(process.pid, 0)
        except ProcessLookupError:
            break
        time.sleep(.025)
    send(signal.SIGKILL)
    process.wait(timeout=3)


def main():
    timeout = float(sys.argv[1])
    input_file = sys.argv[2]
    command = sys.argv[3:]
    if not command or not 0 < timeout <= 3600:
        return 126
    stopped = False
    def stop(*_):
        nonlocal stopped
        stopped = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    source = open(input_file, 'rb') if input_file != '-' else None
    try:
        process = subprocess.Popen(command, stdin=source if source else subprocess.DEVNULL,
                                   start_new_session=True, close_fds=True)
    finally:
        if source:
            source.close()
    deadline = time.monotonic() + timeout
    try:
        while True:
            # Check control before exit: cancellation never becomes success.
            readable, _, _ = select.select([sys.stdin.fileno()], [], [], .05)
            if readable:
                message = os.read(sys.stdin.fileno(), 64)
                return 130 if message else 125
            if stopped:
                return 130
            if time.monotonic() >= deadline:
                return 124
            code = process.poll()
            if code is not None:
                return code if code >= 0 else 128 - code
    finally:
        terminate_group(process)


if __name__ == "__main__":
    sys.exit(main())
