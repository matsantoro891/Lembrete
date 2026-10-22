import Capacitor

class LembreteViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleRemindersPlugin())
    }
}
