# iOS and Apple TV TestFlight

The **TestFlight** GitHub Actions workflow archives physical-device builds, signs them
with your Apple Distribution certificate, exports App Store IPAs, and uploads them
to App Store Connect. It runs for `v*` tags and manually via **Actions → TestFlight →
Run workflow**, with `all`, `ios`, or `tvos`. Pull requests and ordinary pushes keep
using the existing validation/simulator workflow and do not upload builds.

## Configured account

The `testflight` GitHub environment is configured for Developer Team `GSFS4PM5PK`.
The apps are registered as [Cinefern](https://appstoreconnect.apple.com/apps/6822936078)
and [Cinefern TV](https://appstoreconnect.apple.com/apps/6822936113).
The signing certificate and provisioning profiles expire on 14 October 2027;
replace their GitHub secrets when renewing them. The API key named
**Cinefern GitHub TestFlight** has App Manager access.

## Connect your Apple Developer account

An active paid Apple Developer Program membership is required. In your developer
team, register explicit App IDs for:

- **Cinefern** (iOS/iPadOS): `io.github.iteufel.cinefern`
- **Cinefern TV** (tvOS): `io.github.iteufel.cinefern.tv`

Then create two new app records in [App Store Connect](https://appstoreconnect.apple.com/apps).
Choose the matching platform and bundle ID, English as the primary language, and
unique SKUs such as `cinefern-ios` and `cinefern-tvos`. The records must exist before
the first upload. If a name or bundle ID is unavailable, update the corresponding
Expo app config and workflow matrix before building.

Create an **Apple Distribution** certificate with a locally generated private key.
Export the certificate **including its private key** as a password-protected `.p12`.
Create an **App Store Connect** provisioning profile for each App ID, choosing iOS
or tvOS as appropriate and the same distribution certificate. No device UDIDs are
needed for TestFlight. See Apple's [App Store profile instructions](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile).

Create a team App Store Connect API key under **Users and Access → Integrations →
App Store Connect API**, with **App Manager** access. Download the `.p8` file and
record its Key ID and Issuer ID. This key authenticates uploads; the `.p12` signs
the application. Keep both private keys out of chat and source control.

## GitHub configuration

In `iteufel/cinefern`, create the **testflight** Actions environment. Add the
following environment secrets (repository secrets also work):

| Secret                            | Value                                                     |
| --------------------------------- | --------------------------------------------------------- |
| `APPLE_DISTRIBUTION_P12_BASE64`   | Base64 of the distribution certificate/private-key `.p12` |
| `APPLE_DISTRIBUTION_P12_PASSWORD` | Password protecting that `.p12`                           |
| `IOS_APP_STORE_PROFILE_BASE64`    | Base64 of the iOS App Store `.mobileprovision`            |
| `TVOS_APP_STORE_PROFILE_BASE64`   | Base64 of the tvOS App Store `.mobileprovision`           |
| `APP_STORE_CONNECT_KEY_ID`        | App Store Connect API Key ID                              |
| `APP_STORE_CONNECT_ISSUER_ID`     | API Issuer ID                                             |
| `APP_STORE_CONNECT_PRIVATE_KEY`   | Full contents of the `.p8`, including PEM headers         |

Add the environment or repository **variable** `APPLE_TEAM_ID` containing your
10-character Developer Team ID (Membership details in the Developer account).
The workflow fails early when a required setting is missing. It also rejects
expired profiles, wrong platforms/bundle IDs/teams, development/ad hoc profiles,
and profiles that do not match an installed signing certificate.

For example, upload local files directly with GitHub CLI, without pasting keys in chat:

```sh
gh api --method PUT repos/iteufel/cinefern/environments/testflight
gh variable set APPLE_TEAM_ID --env testflight --repo iteufel/cinefern --body YOUR_TEAM_ID
base64 < /path/to/distribution.p12 | tr -d '\n' | gh secret set APPLE_DISTRIBUTION_P12_BASE64 --env testflight --repo iteufel/cinefern
gh secret set APPLE_DISTRIBUTION_P12_PASSWORD --env testflight --repo iteufel/cinefern
base64 < /path/to/ios.mobileprovision | tr -d '\n' | gh secret set IOS_APP_STORE_PROFILE_BASE64 --env testflight --repo iteufel/cinefern
base64 < /path/to/tvos.mobileprovision | tr -d '\n' | gh secret set TVOS_APP_STORE_PROFILE_BASE64 --env testflight --repo iteufel/cinefern
gh secret set APP_STORE_CONNECT_KEY_ID --env testflight --repo iteufel/cinefern
gh secret set APP_STORE_CONNECT_ISSUER_ID --env testflight --repo iteufel/cinefern
gh secret set APP_STORE_CONNECT_PRIVATE_KEY --env testflight --repo iteufel/cinefern < /path/to/AuthKey_KEYID.p8
```

## Build and install

Once this workflow is committed and pushed, run it on the desired branch:

```sh
gh workflow run testflight.yml --repo iteufel/cinefern -f platform=all
```

Build numbers use `<workflow run number>.<attempt>` so rerunning a failed upload
creates a new build number. The marketing version comes from the Expo app configs.
The runner uses macOS 26/Xcode and installs the provisioning profile in Xcode's
current profile directory. Each matrix job removes its temporary signing keychain
and installed profile on completion.
IPAs and build logs are retained for 14 days as workflow artifacts.

After Apple processes the uploads, open each app's **TestFlight** tab and add your
account to an internal testing group with access to the build. Install **TestFlight**
on the iPhone/iPad or Apple TV and accept the invitation. An external testing group
requires beta app information and may require Apple's Beta App Review. CI uploads
the builds; it does not automatically invite testers or submit a public App Store release.
See Apple's [build upload guide](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/).
