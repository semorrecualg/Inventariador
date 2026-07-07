#!/usr/bin/env sh
if [ -z "$husky_skip_init" ]; then
  readonly husky_skip_init=1

  # Avoid any interactive prompt
  export GIT_TERMINAL_PROMPT=0

  husky_env() {
    if [ -f "$1" ]; then
      . "$1"
    fi
  }

  husky_env "$XDG_CONFIG_HOME/husky/init.sh"
  husky_env "$HOME/.config/husky/init.sh"
  husky_env "$HOME/.huskyrc"
fi
