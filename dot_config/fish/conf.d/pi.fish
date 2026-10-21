function pi --description 'Pi without update checks'
    PI_SKIP_VERSION_CHECK=1 command pi $argv
end

# Settings, credentials, and custom system prompt files still load.
function pi-vanilla --description 'Pi without extensions, skills, prompt templates, or context files'
    pi --no-extensions --no-skills --no-prompt-templates --no-context-files $argv
end
