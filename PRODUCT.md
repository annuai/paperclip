# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Tauri 2 desktop app: system webview renders a transparent, always-on-top window. Targets macOS, Windows, Linux; tuned for macOS first.)

## Users
The owner first, running it all day on their Mac as a desk companion; builds will be shared with friends/colleagues and may later be released publicly (recommendation accepted by default: design to a shareable, finished-product bar).

## Product Purpose
Paperclip is a desktop pet in the spirit of the 90s Office assistant: a paperclip character that floats on the desktop, greets the user, tells jokes, offers quotes and tongue-in-cheek tips, fidgets, sleeps, gets dizzy when whipped around, and enters/exits with physical, mat-based animations. Success: it feels alive and charming, and never gets in the way (click-through, low CPU/memory).

## Positioning
An original character (not Microsoft's Clippy art) that recreates the original's behaviour catalogue and timing feel, light enough to leave running all day.

## Operating Context
Sits over whatever the user is doing: any wallpaper, any app, light or dark menu bar. Controlled by click, double-click, drag, hover, right-click menu, and a menu-bar (tray) icon.

## Capabilities and Constraints
- Offline content: greetings, quotes, jokes, tips, dizzy and sleep lines (src/content/*.json).
- 20+ named animations driven by a pose system (src/anim, src/art); rAF only while animating.
- Budgets: ~60 MB RSS, near-zero idle CPU.
- Two visual styles: "Flat" (the default) and "Classic" (the original, kept as is). User switches via a menu toggle in tray + right-click menu, remembered across launches.

## Brand Commitments
- Must never copy Microsoft Clippy / clippy.js artwork.
- Character must keep its personality (expressive brows, eyes, squash-and-stretch) in every style.
- Flat style typography: Oswald (user-requested).

## Product Principles
1. Alive, not loud: personality through motion and expression, never through interruption.
2. Out of the way: never steal clicks, focus, or CPU.
3. One character, many skins: styles change the look, never the behaviour.
