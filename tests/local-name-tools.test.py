#!/usr/bin/env python3
"""Regression tests for the bundled GNfinder and GNparser bridge."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import local_server  # noqa: E402


class LocalNameToolsTest(unittest.TestCase):
    def setUp(self) -> None:
        if local_server.find_gnparser() is None:
            self.skipTest("GNparser is unavailable on this platform")

    def test_gnparser_keeps_authors_separate(self) -> None:
        label = "Prosthechea cochleata (L.) W.E.Higgins var. grandiflora (Mutel) Christenson"
        result = local_server.run_gnparser([label])
        parsed = result["labels"][0]
        self.assertTrue(parsed["parsed"])
        self.assertEqual(parsed["quality"], 1)
        self.assertEqual(
            [word["verbatim"] for word in parsed["words"] if word["wordType"] == "INFRASPECIES"],
            ["grandiflora"],
        )
        self.assertEqual(
            [word["verbatim"] for word in parsed["words"] if word["wordType"] == "AUTHOR_WORD"],
            ["L.", "W.", "E.", "Higgins", "Mutel", "Christenson"],
        )
        self.assertNotIn("normalized", parsed)

    def test_low_quality_tail_is_exposed_for_safe_client_fallback(self) -> None:
        label = "Clematis florida Thunb. voucher HJ-01"
        parsed = local_server.run_gnparser([label])["labels"][0]
        self.assertEqual(parsed["quality"], 4)
        self.assertEqual(parsed["tail"], " HJ-01")

    def test_combined_analysis_returns_both_engines(self) -> None:
        result = local_server.run_taxon_name_analysis(
            ["Coptis japonica var. dissecta", "sample VAR 01"]
        )
        self.assertIn("gnparser", result["engine"])
        self.assertEqual(result["versions"]["gnparser"], "v1.15.0")
        self.assertTrue(result["labels"][0]["parse"]["parsed"])
        self.assertFalse(result["labels"][1]["parse"]["parsed"])


if __name__ == "__main__":
    unittest.main()
