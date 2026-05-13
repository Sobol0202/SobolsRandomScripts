local EXPORT_PATH = "C:/PfadMitSlachNICHTBackslach"
local PRESET_NAME = "Marker_Still_PNG"

local project = resolve:GetProjectManager():GetCurrentProject()
local timeline = project:GetCurrentTimeline()

project:LoadRenderPreset(PRESET_NAME)

local markers = timeline:GetMarkers()
local startFrame = timeline:GetStartFrame()

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
        print("Job angelegt: " .. filename .. " / Frame " .. tostring(absoluteFrame))
        count = count + 1
    else
        print("Job fehlgeschlagen: " .. filename)
    end
end

print("Renderjobs angelegt: " .. tostring(count))
