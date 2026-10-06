import ExpoModulesCore

public class ExpoMoveToBackModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ExpoMoveToBack")

        // No-op on iOS — there is no hardware back button
        Function("moveToBack") {}
    }
}
