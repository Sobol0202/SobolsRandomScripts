$Ordner = "C:\Pfad\Zu\Deinem\Bilderordner"

$ErsteNummer = 1


$Dateien = Get-ChildItem -LiteralPath $Ordner -File |
    Where-Object { $_.Extension -match '^\.(jpg|jpeg|png)$' }

Write-Host ""
Write-Host "Prüfung des Ordners: $Ordner"
Write-Host "========================================"
Write-Host ""

$FalschBenannt = $Dateien |
    Where-Object { $_.BaseName -notmatch '^\d{4}$' }

if ($FalschBenannt) {

    Write-Host "FEHLER: Falsch benannte Dateien:" -ForegroundColor Red

    foreach ($Datei in $FalschBenannt) {
        Write-Host "  $($Datei.Name)"
    }

    Write-Host ""
}
else {
    Write-Host "OK: Keine falsch benannten Dateien gefunden." -ForegroundColor Green
    Write-Host ""
}


$KorrekteDateien = $Dateien |
    Where-Object { $_.BaseName -match '^\d{4}$' }

$DoppelteNummern = $KorrekteDateien |
    Group-Object BaseName |
    Where-Object { $_.Count -gt 1 }

if ($DoppelteNummern) {

    Write-Host "FEHLER: Doppelte Nummern:" -ForegroundColor Red

    foreach ($Gruppe in $DoppelteNummern) {

        Write-Host "  Nummer $($Gruppe.Name):"

        foreach ($Datei in $Gruppe.Group) {
            Write-Host "    $($Datei.Name)"
        }
    }

    Write-Host ""
}
else {
    Write-Host "OK: Keine doppelten Nummern gefunden." -ForegroundColor Green
    Write-Host ""
}

if ($KorrekteDateien.Count -gt 0) {

    $VorhandeneNummern = $KorrekteDateien |
        ForEach-Object { [int]$_.BaseName } |
        Sort-Object -Unique

    $LetzteNummer = ($VorhandeneNummern | Measure-Object -Maximum).Maximum

    $FehlendeNummern = $ErsteNummer..$LetzteNummer |
        Where-Object { $_ -notin $VorhandeneNummern }

    if ($FehlendeNummern) {

        Write-Host "FEHLER: Fehlende Nummern:" -ForegroundColor Red

        foreach ($Nummer in $FehlendeNummern) {
            Write-Host "  $($Nummer.ToString('0000'))"
        }

        Write-Host ""
    }
    else {
        Write-Host "OK: Keine Lücken in der Nummerierung gefunden." -ForegroundColor Green
        Write-Host ""
    }

    Write-Host "Höchste gefundene Nummer: $($LetzteNummer.ToString('0000'))"
}
else {
    Write-Host "Keine korrekt nummerierten Dateien gefunden." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Prüfung abgeschlossen."
