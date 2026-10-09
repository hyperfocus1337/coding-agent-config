# Implementation notes

The factory subscribes to `claude-project` and stores its string directory or `undefined`. At `resources_discover`, which pi fires after `session_start`, it returns that directory's `skills` path only if it exists, or no result. The existence check runs at discovery time, so a directory created or removed after approval is handled without sending a missing path to pi's loader. All factories register before session startup, so coordinator load order does not affect discovery.

The extension does not parse skills, change name precedence, register skill commands, or resolve approval. Pi's native loader owns skill behavior; `claude-project` owns approval. Global settings continue to select user skills and exclude the user-level synced cache.
