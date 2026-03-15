$root = (Resolve-Path "$PSScriptRoot").Path
$rootPrefix = [System.IO.Path]::GetFullPath((Join-Path $root '.'))
if (-not $rootPrefix.EndsWith([System.IO.Path]::DirectorySeparatorChar)) { $rootPrefix += [System.IO.Path]::DirectorySeparatorChar }

$mime = @{
  '.html'='text/html; charset=utf-8'
  '.js'='text/javascript; charset=utf-8'
  '.mjs'='text/javascript; charset=utf-8'
  '.css'='text/css; charset=utf-8'
  '.json'='application/json; charset=utf-8'
  '.svg'='image/svg+xml'
  '.png'='image/png'
  '.jpg'='image/jpeg'
  '.jpeg'='image/jpeg'
  '.gif'='image/gif'
  '.webp'='image/webp'
  '.ico'='image/x-icon'
  '.woff'='font/woff'
  '.woff2'='font/woff2'
  '.map'='application/json; charset=utf-8'
  '.txt'='text/plain; charset=utf-8'
}

function Write-Response {
  param(
    [Parameter(Mandatory = $true)][System.Net.Sockets.NetworkStream]$Stream,
    [Parameter(Mandatory = $true)][int]$StatusCode,
    [Parameter(Mandatory = $true)][string]$ContentType,
    [byte[]]$Body = @()
  )

  $reason = switch ($StatusCode) {
    200 { 'OK' }
    403 { 'Forbidden' }
    404 { 'Not Found' }
    default { 'Error' }
  }

  $headers = @(
    "HTTP/1.1 $StatusCode $reason",
    "Content-Type: $ContentType",
    "Content-Length: $($Body.Length)",
    'Connection: close',
    ''
    ''
  ) -join "`r`n"

  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
}

$lanIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -and
    $_.IPAddress -ne '127.0.0.1' -and
    $_.IPAddress -notlike '169.254.*'
  } |
  Select-Object -ExpandProperty IPAddress -Unique

$endpoints = @('http://localhost:8080/') + ($lanIps | ForEach-Object { "http://$_`:8080/" })
$endpoints | Set-Content -Path (Join-Path $root 'server-endpoints.txt') -Encoding UTF8

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, 8080)
$listener.Start()

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)

    $requestLine = $reader.ReadLine()
    if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

    while ($true) {
      $line = $reader.ReadLine()
      if ([string]::IsNullOrEmpty($line)) { break }
    }

    $parts = $requestLine.Split(' ')
    if ($parts.Count -lt 2) {
      Write-Response -Stream $stream -StatusCode 404 -ContentType 'text/plain; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes('404 Not Found'))
      continue
    }

    $rawPath = $parts[1]
    $cleanPath = [uri]::UnescapeDataString(($rawPath -split '\?')[0]).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($cleanPath)) { $cleanPath = 'index.html' }

    $candidate = Join-Path $root $cleanPath
    if (Test-Path $candidate -PathType Container) { $candidate = Join-Path $candidate 'index.html' }
    $full = [System.IO.Path]::GetFullPath($candidate)

    if (-not $full.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      Write-Response -Stream $stream -StatusCode 403 -ContentType 'text/plain; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes('403 Forbidden'))
      continue
    }

    if (Test-Path $full -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($full)
      Write-Response -Stream $stream -StatusCode 200 -ContentType $contentType -Body $bytes
    } else {
      Write-Response -Stream $stream -StatusCode 404 -ContentType 'text/plain; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes('404 Not Found'))
    }
  } finally {
    $client.Close()
  }
}
