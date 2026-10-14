"""Validate and install the CI App Store profile; generate Xcode export options."""

import base64
import datetime
import hashlib
import os
from pathlib import Path
import plistlib
import re
import subprocess


def prepare():
    env = os.environ
    build_dir = Path(env["BUILD_DIR"])
    build_dir.mkdir(parents=True, exist_ok=True)
    encoded_profile = build_dir / "profile.mobileprovision"
    encoded_profile.write_bytes(base64.b64decode(env["PROFILE_BASE64"], validate=True))
    encoded_profile.chmod(0o600)
    try:
        decoded = subprocess.check_output(
            ["security", "cms", "-D", "-i", str(encoded_profile)]
        )
        profile = plistlib.loads(decoded)
        team = env["APPLE_TEAM_ID"]
        entitlements = profile["Entitlements"]
        bundle_id = env["APP_BUNDLE_ID"]
        prefix = profile["ApplicationIdentifierPrefix"][0]
        expected_platform = {"ios": "iOS", "tvos": "tvOS"}[env["APP_PLATFORM"]]
        checks = {
            "Team ID": team in profile["TeamIdentifier"],
            "bundle ID": entitlements["application-identifier"] == f"{prefix}.{bundle_id}",
            "platform": expected_platform in profile["Platform"],
            "expiration": profile["ExpirationDate"] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None),
            "App Store distribution": not profile.get("ProvisionedDevices")
            and not profile.get("ProvisionsAllDevices")
            and not entitlements.get("get-task-allow", False)
            and entitlements.get("beta-reports-active", False),
        }
        identities = subprocess.check_output(
            ["security", "find-identity", "-v", "-p", "codesigning"], text=True
        )
        checks["installed signing certificate"] = any(
            hashlib.sha1(cert).hexdigest().upper() in identities
            for cert in profile["DeveloperCertificates"]
        )
        for label, valid in checks.items():
            if not valid:
                raise ValueError(f"Provisioning profile has incorrect {label}")
        uuid = profile["UUID"]
        if not re.fullmatch(r"[0-9A-Fa-f-]{36}", uuid):
            raise ValueError("Invalid profile UUID")
        install_dir = Path.home() / "Library/Developer/Xcode/UserData/Provisioning Profiles"
        install_dir.mkdir(parents=True, exist_ok=True)
        installed = install_dir / f"{uuid}.mobileprovision"
        installed.write_bytes(encoded_profile.read_bytes())
        installed.chmod(0o600)
        with open(env["GITHUB_OUTPUT"], "a") as output:
            output.write(f"uuid={uuid}\npath={installed}\n")
        with (build_dir / "ExportOptions.plist").open("wb") as output:
            plistlib.dump(
                {
                    "method": "app-store-connect",
                    "destination": "export",
                    "teamID": team,
                    "signingStyle": "manual",
                    "signingCertificate": "Apple Distribution",
                    "provisioningProfiles": {bundle_id: uuid},
                    "manageAppVersionAndBuildNumber": False,
                    "uploadSymbols": True,
                },
                output,
            )
    finally:
        encoded_profile.unlink(missing_ok=True)


if __name__ == "__main__":
    prepare()
