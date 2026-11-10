# Lets EndNote format a .docx that contains temporary citations
# ({Author, Year #RecordNumber}), turning them into real CWYW fields.
#
# Called by the Obsidian plugin; prints exactly one compact JSON line on stdout.
param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [string]$LibraryPath = "",
    [string]$EndNoteExe = "",
    [int]$WaitSeconds = 60
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }

function Write-Result {
    param([bool]$Ok, [string]$Message, [int]$Fields, [bool]$StartedEndNote)
    $obj = [ordered]@{
        ok             = $Ok
        message        = $Message
        fields         = $Fields
        started_endnote = $StartedEndNote
    }
    Write-Output ($obj | ConvertTo-Json -Compress)
}

function Find-EndNoteExe {
    if ($EndNoteExe -and (Test-Path -LiteralPath $EndNoteExe)) { return $EndNoteExe }
    $candidates = @(
        (Join-Path $env:ProgramFiles 'EndNote 2025\EndNote.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'EndNote 2025\EndNote.exe'),
        (Join-Path $env:ProgramFiles 'EndNote 21\EndNote.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'EndNote 21\EndNote.exe'),
        (Join-Path $env:ProgramFiles 'EndNote 20\EndNote.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'EndNote 20\EndNote.exe')
    )
    foreach ($c in $candidates) { if ($c -and (Test-Path -LiteralPath $c)) { return $c } }
    try {
        $key = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\EndNote.exe'
        if (Test-Path $key) { return (Get-ItemProperty $key).'(default)' }
    } catch { }
    return ""
}

$startedWord = $false
$startedEndNote = $false
$word = $null
$doc = $null

try {
    if (-not (Test-Path -LiteralPath $InputPath)) { throw "找不到输入文件：$InputPath" }

    if (-not (Get-Process WINWORD -ErrorAction SilentlyContinue)) {
        $word = New-Object -ComObject Word.Application
        $word.Visible = $false
        $startedWord = $true
    } else {
        # Attach to the user's running Word; leave its visibility alone.
        $word = New-Object -ComObject Word.Application
    }
    $word.DisplayAlerts = 0

    # EndNote must be running with the library open so record numbers resolve.
    if (-not (Get-Process EndNote -ErrorAction SilentlyContinue)) {
        $exe = Find-EndNoteExe
        if (-not $exe) { throw "没找到 EndNote.exe，无法自动启动 EndNote" }
        if ($LibraryPath -and (Test-Path -LiteralPath $LibraryPath)) {
            Start-Process -FilePath $exe -ArgumentList ('"' + $LibraryPath + '"')
        } else {
            Start-Process -FilePath $exe
        }
        $startedEndNote = $true
        Start-Sleep -Seconds 12
    }

    $doc = $word.Documents.Open($InputPath, $false, $false)
    Start-Sleep -Milliseconds 600

    $error1 = ""
    try { $null = $word.Run("ENFormatBibliography") }
    catch { $error1 = $_.Exception.Message }

    # EndNote formats asynchronously; give it time to add the fields.
    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    while ((Get-Date) -lt $deadline -and $doc.Fields.Count -eq 0) {
        Start-Sleep -Milliseconds 500
    }
    $count = $doc.Fields.Count

    $sawTemporary = $false
    if ($doc.Content.Text -match '\{[^{}]*#\d+[^{}]*\}') { $sawTemporary = $true }

    if ($count -eq 0) {
        if ($error1) { throw ("EndNote 排版失败：" + $error1) }
        if ($sawTemporary) {
            throw "EndNote 没有转换临时引用：请确认 EndNote 里打开的是同一个文献库（$LibraryPath），且没有弹窗等待确认。"
        }
        throw "文档里没有生成 EndNote 域。"
    }

    if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force }
    $doc.SaveAs2([ref]$OutputPath, [ref]12)   # wdFormatXMLDocument
    $doc.Close(0)
    $doc = $null
    Write-Result -Ok $true -Message "ok" -Fields $count -StartedEndNote $startedEndNote
}
catch {
    Write-Result -Ok $false -Message $_.Exception.Message -Fields 0 -StartedEndNote $startedEndNote
}
finally {
    if ($doc -ne $null) { try { $doc.Close(0) } catch { } }
    if ($startedWord -and $word -ne $null) { try { $word.Quit() } catch { } }
}
