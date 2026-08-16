$Ordner = "C:\Pfad\Zu\Deinem\Bilderordner"

Get-ChildItem -LiteralPath $Ordner -File |
    Where-Object {
        $_.Extension -match '^\.(jpg|jpeg|png)$' -and
        $_.BaseName -match '^\d{4}$'
    } |
    ForEach-Object {

        $Datum = $_.CreationTime.ToString("dd.MM.yyyy")
        $NeuerName = "{0}-({1}){2}" -f $_.BaseName, $Datum, $_.Extension

        Rename-Item -LiteralPath $_.FullName -NewName $NeuerName
    }
