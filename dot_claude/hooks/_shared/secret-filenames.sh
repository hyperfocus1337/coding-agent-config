#!/usr/bin/env bash
# Shared secret-filename classifier. Sourced (not executed) by the
# stage-edited-file and block-secret-commits hooks so both agree on
# what counts as a secret. Edit the list here once, both hooks follow.
#
# is_dangerous <basename> -> exit 0 if the name looks like a real secret
# that must never be auto-staged or committed, 1 otherwise (templates
# and everything else). Match on basename, not full path.

is_dangerous() {
  case "$1" in
    # allowlist: templates carry placeholders, not real secrets
    .env.example|.env.sample|.env.template|.env.dist) return 1 ;;
    # env files
    .env|.env.*|.envrc) return 0 ;;
    # private keys (ssh + generic)
    id_rsa|id_dsa|id_ecdsa|id_ed25519) return 0 ;;
    *.pem|*.key|*.p8|*.pkcs8|*.ppk) return 0 ;;
    # keystores / pkcs bundles
    *.pfx|*.p12|*.pkcs12|*.keystore|*.jks) return 0 ;;
    # credential / auth files
    .netrc|.pgpass|.htpasswd|.git-credentials|.dockercfg) return 0 ;;
    credentials.json|*.ovpn|*.kubeconfig) return 0 ;;
  esac
  return 1
}
