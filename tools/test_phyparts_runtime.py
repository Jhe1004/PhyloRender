import unittest

import phyparts_runtime as runtime


class PhyPartsTests(unittest.TestCase):
    def payload(self):
        return {"species": "(T00000,((T00001,T00002),T00003));",
                "genes": ["(T00000,((T00001,T00002)1,T00003)1);",
                          "(T00000,((T00001,T00003)1,T00002)1);",
                          "(T00000,T00001,T00003);"],
                "names": ["O", "A", "B", "C"], "threshold": 0, "mode": "four"}

    def test_validation(self):
        runtime.validate_payload(self.payload())
        for bad in ("(T00000,(T00001,T00001));", "(T00000,(T00001,T99999));", "(A,(B,C));",
                    "(T00000,(T00001,T00002)95);", "(T00000,(T00001,T00002));rm"):
            with self.assertRaises(ValueError):
                runtime.validate_payload({**self.payload(), "genes": [bad]})

    @unittest.skipUnless(runtime.runtime_ready(), "Node.js runtime not installed")
    def test_compatibility_endpoint_uses_independent_javascript_engine(self):
        payload = self.payload()
        payload["mode"] = "two"
        result = runtime.run_analysis(runtime.validate_payload(payload))
        self.assertEqual(result["engine"], runtime.ENGINE)
        self.assertEqual(result["algorithm"], runtime.ALGORITHM)
        self.assertEqual(result["mode"], "four")
        self.assertEqual(result["requestedDisplayMode"], "two")
        self.assertIn("dominant_conflict_N\tother_conflict_N", result["table"])
        self.assertIn("Node1\t1\t1\t0\t1\t1\t2\tA;B", result["table"])

    @unittest.skipUnless(runtime.runtime_ready(), "Node.js runtime not installed")
    def test_support_cutoff_is_strict(self):
        payload = self.payload()
        payload["genes"] = ["(T00000,((T00001,T00002)0.7,T00003)1);"]
        payload["threshold"] = .7
        result = runtime.run_analysis(runtime.validate_payload(payload))
        self.assertIn("Node1\t0\t0\t0\t0\t1\t0\tA;B", result["table"])


if __name__ == "__main__":
    unittest.main()
