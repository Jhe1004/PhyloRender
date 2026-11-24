"""Bounded native execution with cancellation and service-crash cleanup."""
import atexit
from pathlib import Path
import subprocess
import sys
import threading
import tempfile
from types import SimpleNamespace

ACTIVE = set()
LOCK = threading.Lock()


class ComputationCancelled(RuntimeError):
    code = "CANCELLED"
    def __init__(self):
        super().__init__("Computation cancelled; native process terminated")


def request_stop(process):
    try:
        process.stdin.write(b"cancel\n")
        process.stdin.flush()
    except (BrokenPipeError, OSError, ValueError):
        pass


def shutdown():
    with LOCK:
        active = list(ACTIVE)
    for process in active:
        request_stop(process)
    for process in active:
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            # SIGTERM is handled by the guardian and still runs group cleanup.
            process.terminate()


atexit.register(shutdown)


def run_managed(command, work, log, *, cancel_event=None, timeout=300, stdin_file=None, stderr_log=None):
    if cancel_event is not None and cancel_event.is_set():
        raise ComputationCancelled()
    guardian = Path(__file__).with_name("process_guardian.py")
    process = subprocess.Popen([sys.executable, str(guardian), str(timeout), str(stdin_file) if stdin_file else '-', *map(str, command)],
                               cwd=work, stdin=subprocess.PIPE, stdout=log, stderr=stderr_log if stderr_log else log,
                               close_fds=True, start_new_session=True)
    with LOCK:
        ACTIVE.add(process)
    try:
        while True:
            try:
                process.wait(timeout=.1)
                break
            except subprocess.TimeoutExpired:
                if cancel_event is not None and cancel_event.is_set():
                    request_stop(process)
        if cancel_event is not None and cancel_event.is_set() or process.returncode in (125, 130):
            raise ComputationCancelled()
        if process.returncode == 124:
            raise subprocess.TimeoutExpired(command, timeout)
        return process
    finally:
        # Closing this control channel is also the crash/failure protocol.
        process.stdin.close()
        if process.poll() is None:
            process.wait(timeout=5)
        with LOCK:
            ACTIVE.discard(process)


def run_captured(command, *, input_text=None, timeout=30, cancel_event=None):
    with tempfile.TemporaryDirectory(prefix='phylorender-helper-') as directory:
        work = Path(directory)
        source = work / 'stdin.txt'
        if input_text is not None:
            source.write_text(input_text, encoding='utf-8')
        with (work / 'stdout.log').open('w') as stdout, (work / 'stderr.log').open('w') as stderr:
            result = run_managed(command, work, stdout, timeout=timeout, cancel_event=cancel_event,
                                 stdin_file=source if input_text is not None else None, stderr_log=stderr)
        return SimpleNamespace(returncode=result.returncode,
                               stdout=(work / 'stdout.log').read_text(errors='replace'),
                               stderr=(work / 'stderr.log').read_text(errors='replace'))
