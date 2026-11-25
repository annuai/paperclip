# Measurements (macOS arm64, release, ~70 s idle, before poller tweak)
- phys footprint: app 22 MB + WebContent 20 + GPU 12 + Networking 5 = ~59 MB (RSS is higher: ~96 MB app, shared pages).
- Idle CPU (top, 5 s samples): ~1.2-2.3% (above 0.5% target; poller + occasional blink animations). Poller since slowed to ~7 Hz; not re-measured.
- rAF inactive at idle (verified in sandbox via __pcDebug.rafActive()).
