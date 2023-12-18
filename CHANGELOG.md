# Change Log

## [0.9.0]

- Optimized logic for the watcher ( now it updates paths using only regexp ), removed unnecessary iterations, which should highly improve perfomance

## [0.8.0]

- Repo scam check now runs automatically

## [0.7.4]

- Added info messages
- Added repo scam check ( checks if the repo you were given is malicious )
- Fixed minor bugs

## [0.7.0]

- Fixed bugs related to ['"] import strings

## [0.5.15]

- Filtered out test files from vulnerability parse

## [0.5.1*]

- Fixed bugs
- Added more functionality to sLoc report

## [0.5.0]

- Added balance checks when parsing files for vulnerabilities

- Added sLoc file generation logic, which generates an html with some functionality (stores statuses to sessionStorage, sorting file by sLoc, more to come)

- Added settings for sLoc generation, parsing files for potential vulnerabilities

## [0.4.3]

- Added looking for call in contracts marking it as @audit-ok for checked return calls and @audit-issue for unchecked ones. Use with inline bookmarks extension to have the bookmarks in the toolbars for easy navigation

- Improved logic

- Added src path reading from the foundry config to place the scope folder inside of it
