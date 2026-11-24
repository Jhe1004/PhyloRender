"""Real OS-process tests: never substitute UI status for process termination."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest

from process_supervisor import run_managed, run_captured, ComputationCancelled


def running(pid):
    result = subprocess.run(["ps", "-o", "stat=", "-p", str(pid)], capture_output=True, text=True)
    return bool(result.stdout.strip()) and not result.stdout.strip().startswith("Z")


class SupervisorTest(unittest.TestCase):
    def test_captured_helper_preserves_stdin_and_separate_output(self):
        result = run_captured([sys.executable, '-c',
                              "import sys;print(sys.stdin.read());print('diagnostic',file=sys.stderr)"],
                              input_text='Aconitum barbatum', timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), 'Aconitum barbatum')
        self.assertEqual(result.stderr.strip(), 'diagnostic')

    def fixture(self, work, exit_leader=False):
        child = ("import signal,time,pathlib;signal.signal(signal.SIGTERM,signal.SIG_IGN);"
                 "pathlib.Path('child.ready').write_text('ready');time.sleep(60)")
        parent = ("import subprocess,sys,pathlib,time,signal;"
                  "signal.signal(signal.SIGTERM,signal.SIG_IGN);"
                  f"p=subprocess.Popen([sys.executable,'-c',{child!r}]);"
                  "pathlib.Path('child.pid').write_text(str(p.pid));"
                  + ("time.sleep(.1)" if exit_leader else "time.sleep(60)"))
        return [sys.executable, "-c", parent]

    def wait_pid(self, work):
        deadline = time.monotonic() + 5
        path = work / "child.pid"
        while not path.exists() and time.monotonic() < deadline:
            time.sleep(.02)
        self.assertTrue(path.exists())
        return int(path.read_text())

    def assert_stopped(self, pid):
        deadline = time.monotonic() + 5
        while running(pid) and time.monotonic() < deadline:
            time.sleep(.03)
        self.assertFalse(running(pid), f"Native descendant {pid} survived")

    def test_cancellation_kills_signal_resistant_descendants(self):
        with tempfile.TemporaryDirectory() as directory, open(os.devnull, "w") as log:
            work = Path(directory)
            cancel = threading.Event()
            def cancel_ready_child():
                deadline = time.monotonic() + 5
                while not (work / 'child.ready').exists() and time.monotonic() < deadline:
                    time.sleep(.02)
                if (work / 'child.ready').exists():
                    cancel.set()
            canceller = threading.Thread(target=cancel_ready_child)
            canceller.start()
            try:
                with self.assertRaises(ComputationCancelled):
                    run_managed(self.fixture(work), work, log, cancel_event=cancel, timeout=5)
            finally:
                canceller.join(timeout=6)
            self.assertFalse(canceller.is_alive())
            self.assert_stopped(self.wait_pid(work))

    def test_timeout_kills_descendants(self):
        with tempfile.TemporaryDirectory() as directory, open(os.devnull, "w") as log:
            work = Path(directory)
            with self.assertRaises(subprocess.TimeoutExpired):
                run_managed(self.fixture(work), work, log, timeout=.4)
            self.assert_stopped(self.wait_pid(work))

    def test_successful_leader_cannot_leave_a_background_child(self):
        with tempfile.TemporaryDirectory() as directory, open(os.devnull, "w") as log:
            work = Path(directory)
            result = run_managed(self.fixture(work, exit_leader=True), work, log, timeout=5)
            self.assertEqual(result.returncode, 0)
            self.assert_stopped(self.wait_pid(work))

    def test_service_sigkill_triggers_independent_guardian(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            command = self.fixture(work)
            source = (f"import sys;sys.path.insert(0,{str(Path(__file__).parent)!r});"
                      "from process_supervisor import run_managed;"
                      f"run_managed({command!r},{str(work)!r},sys.stdout,timeout=10)")
            service = subprocess.Popen([sys.executable, "-c", source], stdout=subprocess.DEVNULL)
            pid = self.wait_pid(work)
            os.kill(service.pid, signal.SIGKILL)
            service.wait(timeout=3)
            self.assert_stopped(pid)


if __name__ == "__main__":
    unittest.main()
