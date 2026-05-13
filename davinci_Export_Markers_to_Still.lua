local PRESET_NAME = "Marker_Still_PNG"

-- Windows-Ordnerauswahl
local function chooseFolder()
    local command = [[
powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Export-Ordner auswählen'; $f.ShowNewFolderButton = $true; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }"
]]

    local handle = io.popen(command)
    if not handle then return nil end

    local result = handle:read("*a")
    handle:close()

    result = result:gsub("^%s+", ""):gsub("%s+$", "")
    result = result:gsub("\\", "/")

    if result == "" then
        return nil
    end

    return result
end

local EXPORT_PATH = chooseFolder()

if not EXPORT_PATH then
    print("Kein Export-Ordner ausgewählt. Abbruch.")
    return
end

local project = resolve:GetProjectManager():GetCurrentProject()
local timeline = project:GetCurrentTimeline()

if not project or not timeline then
    print("Kein Projekt oder keine Timeline aktiv.")
    return
end

project:LoadRenderPreset(PRESET_NAME)

local markers = timeline:GetMarkers()
local startFrame = timeline:GetStartFrame()

if not markers or next(markers) == nil then
    print("Keine Marker gefunden.")
    return
end

local markerFrames = {}

for frame, _ in pairs(markers) do
    if type(frame) == "number" then
        table.insert(markerFrames, frame)
    end
end

table.sort(markerFrames)

resolve:OpenPage("deliver")

local count = 0

for index, markerFrame in ipairs(markerFrames) do
    local marker = markers[markerFrame]
    local absoluteFrame = startFrame + markerFrame

    local markerName = marker.name or "Marker"
    markerName = markerName:gsub("[^%w_%-%s]", "_")

    local filename = string.format("%03d_%s", index, markerName)

    project:SetRenderSettings({
        TargetDir = EXPORT_PATH,
        CustomName = filename,
        SelectAllFrames = false,
        MarkIn = absoluteFrame,
        MarkOut = absoluteFrame
    })

    local jobId = project:AddRenderJob()

    if jobId then
        print("Job angelegt: " .. filename)
        count = count + 1
    else
        print("Job fehlgeschlagen: " .. filename)
    end
end

print("===================================")
print("Renderjobs angelegt: " .. tostring(count))
print("Export-Ordner: " .. EXPORT_PATH)
print("Jetzt Render All starten.")
print("===================================")
