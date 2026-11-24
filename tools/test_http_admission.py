import io
import json
import threading
import unittest
from unittest.mock import patch
import local_server as server


class AdmissionTests(unittest.TestCase):
    def test_optional_taxonomy_cannot_starve_scientific_requests(self):
        release = threading.Event()
        first_entered = threading.Event()
        second_decided = threading.Event()
        responses = {}

        def request(name, endpoint, payload):
            handler = object.__new__(server.PhyloRenderHandler)
            body = json.dumps(payload).encode()
            handler.path = endpoint
            handler.headers = {"Content-Length": str(len(body))}
            handler.rfile = io.BytesIO(body)
            handler.allowed = lambda **kwargs: True
            def respond(status, result):
                responses[name] = (status, result)
                if name == "second":
                    second_decided.set()
            handler.send_json = respond
            handler.do_POST()

        def taxonomy(labels):
            if labels == ["first"]:
                first_entered.set()
            else:
                second_decided.set()
            release.wait(3)
            return {"labels": []}

        threads = []
        with patch.object(server, "run_taxon_name_analysis", side_effect=taxonomy), \
                patch.object(server, "run_cloud_dating", return_value={"ok": True}):
            try:
                for name, event in (("first", first_entered), ("second", second_decided)):
                    thread = threading.Thread(target=request,
                        args=(name, "/api/taxon-names", {"labels": [name]}))
                    threads.append(thread)
                    thread.start()
                    self.assertTrue(event.wait(2), name)
                request("science", "/api/cloud-date", {"fixture": True})
                self.assertEqual(responses["science"], (200, {"ok": True}))
                self.assertEqual(responses["second"][0], 429)
            finally:
                release.set()
                for thread in threads:
                    thread.join(3)
                    self.assertFalse(thread.is_alive())
        # All admission permits are returned, including the rejected helper.
        self.assertTrue(server.REQUEST_SLOTS.acquire(blocking=False))
        self.assertTrue(server.REQUEST_SLOTS.acquire(blocking=False))
        self.assertFalse(server.REQUEST_SLOTS.acquire(blocking=False))
        server.REQUEST_SLOTS.release()
        server.REQUEST_SLOTS.release()


if __name__ == "__main__":
    unittest.main()
