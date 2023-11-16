# Solidity paths helper README

## Features

An extension for helping auditors and devs freely move solidity files without needing to edit import paths.

- If there is a scope file in the working folder, the extension will create the src/scope folder and move the files from the scope list into it. Then the watcher will be activated ( the thing that edits the paths automatically on a file move). You can place a .sol file anywhere you want inside of the working folder, it will still have all the right import paths, as well as the other ones that imports the moved one.

( The extension skips the lib|out|node_modules folder, so installing deps and building won't trigger it )

- If there's no scope file, then the watcher will be activated
- The path for the src/scope folder is based on the foundry.toml location
- If there are 2 foundry.toml files, the watcher will be activated with the error asking you to reorganize the project to have only 1 foundry.toml file.

## Extension Settings

press f1 and find the sol-paths command to move the files

## Known Issues

Doesn't support multiple file/folder movement for now.

**Enjoy!**
