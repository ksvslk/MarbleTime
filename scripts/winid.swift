// Prints the CGWindowID of the largest on-screen window whose owner name contains the argument.
// Used by vega.sh to screenshot the Vega Virtual Device window: swift scripts/winid.swift vega-virtual-device
import CoreGraphics
import Foundation

let needle = CommandLine.arguments.count > 1 ? CommandLine.arguments[1].lowercased() : "vega-virtual-device"
let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else { exit(1) }

var best: (id: Int, area: Double)? = nil
for window in windows {
  let owner = (window[kCGWindowOwnerName as String] as? String ?? "").lowercased()
  guard owner.contains(needle), let id = window[kCGWindowNumber as String] as? Int else { continue }
  let bounds = window[kCGWindowBounds as String] as? [String: Double] ?? [:]
  let area = (bounds["Width"] ?? 0) * (bounds["Height"] ?? 0)
  if best == nil || area > best!.area { best = (id, area) }
}

guard let found = best else {
  FileHandle.standardError.write("no window owned by '\(needle)'\n".data(using: .utf8)!)
  exit(1)
}
print(found.id)
