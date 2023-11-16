# Solidity Paths Helper

## Features

An extension for helping auditors freely move solidity files without needing to edit import paths.

- If there is a scope file in the working folder, the extension will create the src/scope folder and move the files from the scope list into it. Then the watcher will be activated ( the thing that edits the paths automatically on a file move). You can place a .sol file anywhere you want inside of the working folder, it will still have all the right import paths, as well as the other ones that imports the moved one.

- If there's no scope file, then the watcher will be activated
- The path for the src/scope folder is based on the foundry.toml or hardhat.config locations ( if both exists, foundry config path will be selected as the base one)
- If there are more than foundry.toml files, the watcher will be activated with the error asking you to reorganize the project to have only 1 foundry.toml file.

## Extension Settings

Press F1, find the sol-paths-helper command and run it to activate the extension

## Known Issues

Doesn't support simultaneous multiple file/folder movement for now.

**Enjoy!**
