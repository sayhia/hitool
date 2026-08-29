package services

// Version is the application version shown in the UI and used for update
// checks. Releases inject it at build time via
//
//	-ldflags "-X hitool/services.Version=<semver>"
//
// so local/dev builds read "dev" while release builds carry the tagged
// version (set-version.sh keeps it in sync with the git tag).
var Version = "dev"
