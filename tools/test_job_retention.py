import threading
import time
import unittest
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch
import phyparts_runtime as runtime


class RetentionTests(unittest.TestCase):
    def setUp(self):
        runtime.JOBS.clear()
        runtime.CONTROLS.clear()

    def wait(self, token):
        for _ in range(100):
            result = runtime.status(token)
            if result["status"] in {"complete", "failed", "cancelled"}:
                return result
            time.sleep(.005)
        self.fail("job did not finish")

    def test_new_job_keeps_previous_result(self):
        with patch.object(runtime, "validate_payload", side_effect=lambda p: p), \
                patch.object(runtime, "run_analysis", return_value={"table": "fixture"}):
            first = runtime.submit({})
            self.wait(first)
            second = runtime.submit({})
            self.wait(second)
            self.assertEqual(runtime.status(first)["result"]["table"], "fixture")
            self.assertNotEqual(first, second)

    def test_cancel_and_expiry_are_explicit(self):
        def execute(payload, progress, event):
            event.wait(1)
            if event.is_set():
                raise RuntimeError("cancelled")
        with patch.object(runtime, "validate_payload", side_effect=lambda p: p), \
                patch.object(runtime, "run_analysis", side_effect=execute):
            token = runtime.submit({})
            self.assertEqual(runtime.cancel(token)["status"], "cancelling")
            self.assertEqual(self.wait(token)["status"], "cancelled")
        self.assertEqual(runtime.status("missing")["status"], "expired")

    def test_cancellation_reaps_actual_child_process(self):
        event = threading.Event()
        processes = []
        original = subprocess.Popen
        def launch(*args, **kwargs):
            process = original(*args, **kwargs)
            processes.append(process)
            event.set()
            return process
        with tempfile.TemporaryDirectory() as directory, \
                open(Path(directory) / "child.log", "w") as log, \
                patch.object(runtime.subprocess, "Popen", side_effect=launch):
            with self.assertRaisesRegex(RuntimeError, r"(?i)cancel"):
                runtime.run_cancellable([sys.executable, "-c", "import time;time.sleep(20)"], directory, log, event)
        self.assertEqual(len(processes), 1)
        self.assertIsNotNone(processes[0].poll(), "cancelled child must be reaped")


if __name__ == "__main__":
    unittest.main()
