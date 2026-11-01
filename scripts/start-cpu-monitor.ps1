param([switch]$CheckOnly)

# Compatibility entry point: the old external WinRing0-based monitor is not started.
Write-Output 'CPU temperature and compatible fan sensors are built into Cirrus. A supported PawnIO driver may be required; see README.md.'
exit 0
