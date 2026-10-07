# Connect your Claude account

This guide is for anyone on the marketing team who needs to connect a Claude account to bistec-studio. You do not need to be technical. It takes about ten minutes.

## Why you need this

bistec-studio writes captions and designs posts by calling Claude. In the way we run it (CLI mode), those calls are billed to a Claude subscription (Pro, Max, Team or Enterprise), not to a shared company key. So the app needs a Claude token to act on someone's behalf.

There are two kinds of token:

- **Personal token.** Connected at **Settings** (`/settings`). Posts you generate are billed to _your_ Claude subscription. Everyone who generates posts should connect one.
- **Team token.** Connected at **Team** (`/team`), by **team admins only**. It is used when nobody is signed in to do the work: scheduled posts, and the MCP and ACP connections. It is also the fallback if your personal token is rejected.

The app tries your personal token first, then the team token. If neither exists, generation fails. There is no other fallback, so a team that only uses scheduled posts needs a team token.

A token is a long password that starts with `sk-ant-oat01-`. Treat it like a password: do not share it or post it in chat.

## Step 1: Install Claude Code on your computer

Claude Code is the small program that creates the token. You only need it to make the token. Pick your system.

### Windows

1. Press **Win + X** and choose **Windows PowerShell** (or **Terminal**). A window opens with a blinking cursor. Its lines start with `PS C:\Users\YourName>`. If yours do not start with `PS`, you opened CMD, so close it and open PowerShell. Do not pick the one that says `(x86)`.
2. Paste this line and press **Enter**:

   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```

   Wait until it says "Claude Code successfully installed!". You do not need to run PowerShell as Administrator.

3. **Close PowerShell and open a new window** (Win + X again). Check it worked:

   ```powershell
   claude --version
   ```

   It should print a version number such as `2.1.211 (Claude Code)`.

**Updating and removing (Windows, installed as above).** Anthropic's installer updates itself in the background. To update right now, run `claude update`. To remove it, run:

```powershell
Remove-Item -Path "$env:USERPROFILE\.local\bin\claude.exe" -Force
Remove-Item -Path "$env:USERPROFILE\.local\share\claude" -Recurse -Force
```

**If you installed with winget instead.** Anthropic also publishes `winget install Anthropic.ClaudeCode`. We suggest the installer above, because of a known winget problem ([winget-cli issue 6200](https://github.com/microsoft/winget-cli/issues/6200)): after a winget install, Claude Code may not appear in `winget list`, and winget may then be unable to upgrade or uninstall it. That issue is still open and offers no fix. If `winget upgrade Anthropic.ClaudeCode` or `winget uninstall Anthropic.ClaudeCode` does nothing, install again with the PowerShell line above, which puts a working copy in place. If you also want the old winget copy gone, an IT person has to delete it by hand. You only need one working `claude`.

### macOS

1. Press **Cmd + Space**, type `Terminal` and press **Enter**.
2. Paste this line and press **Enter**:

   ```bash
   curl -fsSL https://claude.ai/install.sh | bash
   ```

   Wait until it says "Claude Code successfully installed!".

3. **Close Terminal and open a new window.** Check it worked:

   ```bash
   claude --version
   ```

If you already use Homebrew, Anthropic's other documented route is `brew install --cask claude-code`. Homebrew does not auto-update, so run `brew upgrade claude-code` now and then.

To update the installer version, run `claude update`. To remove it:

```bash
rm -f ~/.local/bin/claude
rm -rf ~/.local/share/claude
```

### Linux

Follow Anthropic's own instructions: <https://code.claude.com/docs/en/setup#install-claude-code>.

## Step 2: Get your token

1. Open a **new** terminal window (PowerShell on Windows, Terminal on macOS). A window that was open during the install will not know about `claude` yet.
2. Run:

   ```bash
   claude setup-token
   ```

3. Your browser opens. Sign in with the Claude account you want to be billed and approve access.
4. Go back to the terminal. It prints a token that starts with `sk-ant-oat01-`. **Copy the whole value.** The command does not save it anywhere, so if you lose it, run `claude setup-token` again.

The token lasts about a year and needs a Pro, Max, Team or Enterprise plan (the free plan does not work).

## Step 3: Paste it into bistec-studio

- **Your personal token:** open **Settings** (`/settings`), find **Claude account**, paste the token and save.
- **The team token (team admins only):** open **Team** (`/team`), find the Claude account section, paste the token and save.

The app checks the token when you save it. A green "connected" status means you are done.

## Troubleshooting

**"Token was rejected" when saving.** The token was copied incompletely, has an extra space, or was made for a different account. Run `claude setup-token` again in a new terminal, copy the full value carefully and paste it again.

**`'claude' is not recognized` (Windows) or `command not found: claude` (macOS).** The terminal does not know where Claude Code was installed yet.

1. Close the terminal and open a new one. This fixes it most of the time.
2. Windows: in PowerShell, run these two lines, then open a new window:

   ```powershell
   $currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
   [Environment]::SetEnvironmentVariable('PATH', "$currentPath;$env:USERPROFILE\.local\bin", 'User')
   ```

3. macOS (the default shell is Zsh): run these two lines, then open a new window:

   ```bash
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   ```

If it still fails, the install may not have finished. Run the install line again and look for "Claude Code successfully installed!".

**The token expired (about a year later).** Generate a new one: run `claude setup-token` in a new terminal, then paste the new value over the old one in Settings (or Team).

**"Invalid — reconnect" shows in the app.** Claude rejected the saved token (it expired, or the account lost access). Run `claude setup-token` and paste the new token in the same place. Until then, the app falls back from your personal token to the team token if there is one.

**Still stuck?** Anthropic's guide covers more cases: <https://code.claude.com/docs/en/troubleshoot-install>.

## Sources

All checked on 2026-10-02.

- Anthropic, "Advanced setup" (install routes, update, uninstall, `claude --version`): <https://code.claude.com/docs/en/setup>
- Anthropic, "Terminal guide for new users" (opening a terminal, PATH fixes): <https://code.claude.com/docs/en/terminal-guide>
- Anthropic, "Troubleshoot installation and login": <https://code.claude.com/docs/en/troubleshoot-install>
- Anthropic, "Authentication", section "Generate a long-lived token" (`claude setup-token`, one-year token, requires Pro, Max, Team or Enterprise): <https://code.claude.com/docs/en/authentication>
- Microsoft winget-cli issue 6200, "Anthropic.ClaudeCode" not shown in `winget list` and not upgradable or removable (open, no workaround): <https://github.com/microsoft/winget-cli/issues/6200>
