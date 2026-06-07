$i = 1
Get-ChildItem -File | Sort-Object Name | ForEach-Object {
    Rename-Item $_ -NewName ("{0:D4}{1}" -f $i, $_.Extension)
    $i++
}
