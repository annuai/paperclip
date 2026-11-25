# Packaging

## Homebrew cask

`homebrew/paperclip.rb` is a cask template. Homebrew installs casks from a "tap", which is just a GitHub repo named `homebrew-<something>`.

### One-time setup

1. Create a public repo called `annuai/homebrew-tap`.
2. Copy `homebrew/paperclip.rb` to `Casks/paperclip.rb` in that repo and push.
3. People can then install with:

   ```sh
   brew install --cask annuai/tap/paperclip
   ```

The release repo (`annuai/paperclip`) must be public, or Homebrew cannot download the dmg.

### Every release

After the draft release is published (see "Releases" in the main README):

1. Download the universal dmg, `Paperclip_<version>_universal.dmg`, from the release.
2. Get its checksum:

   ```sh
   shasum -a 256 Paperclip_0.2.0_universal.dmg
   ```

3. In `Casks/paperclip.rb` in the tap repo, set `version` (no leading `v`) and `sha256`, commit and push.
4. Check it before announcing: `brew audit --cask --online annuai/tap/paperclip` and `brew install --cask annuai/tap/paperclip`.

The dmg file name comes from Tauri: `<productName>_<version>_<arch>.dmg`, and `universal` for the universal build. If the name on the release page differs, change the `url` line.

Because Paperclip updates itself, the cask sets `auto_updates true`. `brew upgrade` skips it unless you pass `--greedy`.
