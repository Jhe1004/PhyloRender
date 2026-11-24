import threading
import time
import unittest
from native_jobs import NativeJobs


class NativeJobTest(unittest.TestCase):
    def wait(self, jobs, token):
        for _ in range(100):
            result = jobs.status(token)
            if result['status'] not in {'running', 'cancelling'}:
                return result
            time.sleep(.02)
        self.fail('Job did not stop')

    def test_missing_client_lease_cancels_without_polling(self):
        jobs = NativeJobs(lease_seconds=.1)
        reaped = threading.Event()
        def execute(payload, progress, event):
            event.wait(2)
            time.sleep(.05)  # represents process reaping before terminal state
            reaped.set()
        token = jobs.submit({}, execute)
        time.sleep(.35)
        self.assertTrue(reaped.is_set())
        self.assertEqual(jobs.status(token)['code'], 'CLIENT_DISCONNECTED')
        self.assertFalse(jobs.controls)

    def test_deadline_cancels_even_if_client_keeps_polling(self):
        jobs = NativeJobs(deadline_seconds=.1)
        token = jobs.submit({}, lambda p, progress, event: event.wait(2))
        result = self.wait(jobs, token)
        self.assertEqual(result['status'], 'cancelled')
        self.assertEqual(result['code'], 'DEADLINE_EXCEEDED')

    def test_result_not_committed_after_cancel_and_running_job_not_evicted(self):
        jobs = NativeJobs()
        token = jobs.submit({}, lambda p, progress, event: event.wait(2))
        with self.assertRaises(ValueError):
            jobs.submit({}, lambda *args: None)
        with self.assertRaises(ValueError):
            jobs.forget(token)
        jobs.cancel(token)
        result = self.wait(jobs, token)
        self.assertEqual(result['code'], 'CANCELLED')
        self.assertNotIn('result', result)


if __name__ == '__main__':
    unittest.main()
