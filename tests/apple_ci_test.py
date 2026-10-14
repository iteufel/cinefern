"""Exercise signing-profile rejection paths without Apple credentials."""

import base64
import copy
import datetime
import hashlib
import importlib.util
import os
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "apple_profile", Path(__file__).resolve().parents[1] / "scripts/apple-profile.py"
)
apple_profile = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apple_profile)


class AppleProfileTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.output = root / "output"
        self.profile = {
            "UUID": "00000000-0000-0000-0000-000000000001",
            "TeamIdentifier": ["TESTTEAM01"],
            "ApplicationIdentifierPrefix": ["PREFIX0001"],
            "Platform": ["iOS"],
            "ExpirationDate": datetime.datetime.now() + datetime.timedelta(days=7),
            "DeveloperCertificates": [b"test certificate"],
            "Entitlements": {
                "application-identifier": "PREFIX0001.io.github.iteufel.cinefern",
                "get-task-allow": False,
                "beta-reports-active": True,
            },
        }
        self.env = {
            "HOME": str(root),
            "BUILD_DIR": str(root / "build"),
            "PROFILE_BASE64": base64.b64encode(b"signed profile").decode(),
            "APPLE_TEAM_ID": "TESTTEAM01",
            "APP_BUNDLE_ID": "io.github.iteufel.cinefern",
            "APP_PLATFORM": "ios",
            "GITHUB_OUTPUT": str(self.output),
        }

    def prepare(self, profile=None, certificate_matches=True):
        identity = hashlib.sha1(b"test certificate").hexdigest().upper()
        with patch.dict(os.environ, self.env), patch.object(
            apple_profile.subprocess,
            "check_output",
            side_effect=[
                plistlib.dumps(profile or self.profile),
                identity if certificate_matches else "0 valid identities found",
            ],
        ):
            apple_profile.prepare()

    def test_exports_ios_and_tvos_profiles(self):
        for platform, apple_platform, bundle in [
            ("ios", "iOS", "io.github.iteufel.cinefern"),
            ("tvos", "tvOS", "io.github.iteufel.cinefern.tv"),
        ]:
            with self.subTest(platform=platform):
                profile = copy.deepcopy(self.profile)
                profile["Platform"] = [apple_platform]
                profile["Entitlements"]["application-identifier"] = f"PREFIX0001.{bundle}"
                self.env.update(APP_PLATFORM=platform, APP_BUNDLE_ID=bundle)
                self.prepare(profile)
                export = plistlib.loads(
                    (Path(self.env["BUILD_DIR"]) / "ExportOptions.plist").read_bytes()
                )
                self.assertEqual(export["method"], "app-store-connect")
                self.assertEqual(export["provisioningProfiles"], {bundle: profile["UUID"]})
                self.assertFalse(export["manageAppVersionAndBuildNumber"])
                installed = Path(self.output.read_text().split("path=")[-1].strip())
                self.assertEqual(installed.read_bytes(), b"signed profile")
                self.assertFalse((Path(self.env["BUILD_DIR"]) / "profile.mobileprovision").exists())

    def test_rejects_wrong_team_platform_bundle_and_expired_profile(self):
        for field, value in [
            ("TeamIdentifier", ["OTHERTEAM0"]),
            ("Platform", ["tvOS"]),
            ("ExpirationDate", datetime.datetime(2000, 1, 1)),
            ("Entitlements", {"application-identifier": "PREFIX0001.other.app"}),
        ]:
            with self.subTest(field=field):
                profile = copy.deepcopy(self.profile)
                profile[field] = value
                with self.assertRaises(ValueError):
                    self.prepare(profile)
                self.assertFalse(self.output.exists())

    def test_rejects_development_and_ad_hoc_profiles(self):
        for change in [
            {"ProvisionedDevices": ["device"]},
            {"ProvisionsAllDevices": True},
            {"Entitlements": {**self.profile["Entitlements"], "get-task-allow": True}},
            {"Entitlements": {**self.profile["Entitlements"], "beta-reports-active": False}},
        ]:
            with self.subTest(change=change):
                profile = {**copy.deepcopy(self.profile), **change}
                with self.assertRaisesRegex(ValueError, "App Store distribution"):
                    self.prepare(profile)

    def test_rejects_certificate_without_matching_private_key(self):
        with self.assertRaisesRegex(ValueError, "installed signing certificate"):
            self.prepare(certificate_matches=False)


if __name__ == "__main__":
    unittest.main()
