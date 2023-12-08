# Change Log

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
