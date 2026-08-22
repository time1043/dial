# Dial v0.0.3

## What's New

### 🔄 Enhanced Loop Playback System

- **Single Episode Loop**: Videos now loop automatically when they complete, providing continuous playback without manual intervention.
- **Folder Loop Mode**: Enhanced playback behavior to loop through all videos in the current folder. Two additional parameters have been added:
    - **Folder Order Mode**: Choose between "File tree order" (follows folder structure) or "Index.md list" (follows order declared in index.md files under "# List" heading)
    - **Folder Loop Depth**: Control the scope of folder looping (1 = note's own folder, 2 = parent folder and subfolders, etc.)
- **Settings Integration**: All loop-related settings are configurable through the Settings interface with clear descriptions and visual hierarchy.

### 🔍 Subtitle Search Functionality

- **Integrated Search Panel**: Added powerful search functionality directly within the subtitles panel with case-insensitive filtering.
- **Keyboard Shortcuts**:
    - `S` key: Focus subtitle search input
    - `Escape` key: Clear search results and return to full subtitle list
    - `D` key: Clear search results quickly
- **Mobile Optimization**: Fixed various mobile-specific bugs including viewport handling, focus management, and CSS layout issues.
- **Performance Enhancement**: Optimized subtitle lookup from O(n) to O(log n) using binary search for faster results.

### 🏗️ Code Refactoring

- **Modular Architecture**: Extracted core components into focused modules for better maintainability:
    - **SubtitleSearchController**: Separated search logic from subtitle panel
    - **Sync Orchestration**: Extracted vault sync coordination into dedicated module
    - **Path Resolution**: Centralized media path resolution and vault path handling
    - **Type Management**: Separated word parsing and type answer rendering for cleaner code structure
- **Mobile Compatibility**: Removed Node.js dependencies, replaced with Obsidian vault API for full mobile support
- **Component Separation**: Improved AB loop management with clear delegation patterns between desktop and mobile paths

### 🧪 Testing Infrastructure with Vitest

- **Comprehensive Test Suite**: Added Vitest 4 with dual test projects (unit + browser) for full coverage
- **Automated Testing**: Integrated tests for subtitle parsers, layout, settings, and core functionality
- **Browser Testing**: Playwright-powered browser testing for cross-platform compatibility
- **Test UI**: Added Vitest UI for visual test running and debugging
- **Coverage Reporting**: Implemented module coverage tracking to ensure code quality

### 🌐 URL-Based Video Playback

- **Experimental Feature**: Introduced non-local MP4 file playback capability using video URLs
- **Enhanced Commands**: Added "Open video player with video URL" command for streaming external content
- **Route Implementation**: Implemented iframe-based video playback for external URLs
- **Note**: This is an experimental feature (commit hash: 2516) and may contain bugs that need refinement.

## Technical Improvements

### Loop Playback Details

- **Episode Navigation**: Integrated episode navigator with loop playback for seamless transitions
- **Player Controls**: Enhanced player controls to properly handle loop mode transitions
- **Settings Persistence**: Loop mode settings are preserved across sessions and properly validated

### Subtitle Search Features

- **User Experience**: Added clear button for quick search dismissal
- **Focus Management**: Fixed focus stealing and CSS hiding bugs for better interaction
- **Mobile Layout**: Implemented responsive design with proper keyboard handling
- **Performance**: Binary search implementation significantly improves search speed

### Code Quality

- **TypeScript**: Maintained strict TypeScript throughout the codebase
- **Error Handling**: Improved error handling and user feedback mechanisms
- **Documentation**: Enhanced code documentation and type definitions

## Known Issues

- **All Files Loop Mode**: Implementation is upcoming and currently has no effect
- **URL Playback**: Experimental feature may have stability issues with certain sources
- **Mobile Testing**: Some features may require additional mobile device testing

## Future Enhancements

- Complete "Loop all files" functionality
- URL playback with local subtitle support
- Additional performance optimizations
- Enhanced mobile experience
