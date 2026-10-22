import Foundation
import Capacitor
import EventKit
import EventKitUI

/// EventKit is available only inside the native iOS app, never Safari/PWA.
@objc(AppleRemindersPlugin)
public class AppleRemindersPlugin: CAPPlugin, CAPBridgedPlugin, EKEventEditViewDelegate {
    public let identifier = "AppleRemindersPlugin"
    public let jsName = "AppleReminders"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "complete", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openCalendar", returnType: CAPPluginReturnPromise)
    ]

    // All access to the store and link registry is serialized on the main queue.
    private lazy var eventStore = EKEventStore()
    private let linksKey = "lembrete-ms.apple-reminders.links.v1"
    private let allowedAlertMinutes: Set<Int> = [0, 5, 10, 15, 30, 60, 1440]
    private var pendingCalendarCall: CAPPluginCall?

    private var links: [String: String] {
        get { UserDefaults.standard.dictionary(forKey: linksKey) as? [String: String] ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: linksKey) }
    }

    private func parseDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }

    private func localId(_ call: CAPPluginCall) -> String? {
        guard let id = call.getString("reminderId"), !id.isEmpty, id.count <= 128 else {
            call.reject("Identificador do lembrete inválido.", "INVALID_REMINDER")
            return nil
        }
        return id
    }

    private func authorized() -> Bool {
        let status = EKEventStore.authorizationStatus(for: .reminder)
        if #available(iOS 17.0, *) {
            return status == .fullAccess
        }
        return status == .authorized
    }

    private func withPermission(_ call: CAPPluginCall, action: @escaping () -> Void) {
        DispatchQueue.main.async {
            if self.authorized() {
                action()
                return
            }
            let status = EKEventStore.authorizationStatus(for: .reminder)
            guard status == .notDetermined else {
                call.reject(
                    "O acesso aos Lembretes não foi autorizado. Você pode liberá-lo nos Ajustes do iPhone.",
                    "PERMISSION_DENIED"
                )
                return
            }

            let completion: (Bool, Error?) -> Void = { granted, error in
                DispatchQueue.main.async {
                    guard error == nil else {
                        call.reject("Não foi possível solicitar acesso aos Lembretes.", "PERMISSION_ERROR", error)
                        return
                    }
                    // The request's result is authoritative; the static status can
                    // lag the completion callback on some OS versions.
                    guard granted else {
                        call.reject(
                            "O acesso aos Lembretes não foi autorizado. O lembrete continua salvo no Lembrete MS.",
                            "PERMISSION_DENIED"
                        )
                        return
                    }
                    action()
                }
            }

            if #available(iOS 17.0, *) {
                self.eventStore.requestFullAccessToReminders(completion: completion)
            } else {
                self.eventStore.requestAccess(to: .reminder, completion: completion)
            }
        }
    }

    @objc func save(_ call: CAPPluginCall) {
        guard let id = localId(call) else { return }
        guard let rawTitle = call.getString("title"),
              let startsAtValue = call.getString("startsAt"),
              let startsAt = parseDate(startsAtValue),
              let alertMinutes = call.getInt("alertMinutes"),
              allowedAlertMinutes.contains(alertMinutes) else {
            call.reject("A data, o horário ou a antecedência do lembrete é inválida.", "INVALID_REMINDER")
            return
        }
        let title = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title.count <= 500 else {
            call.reject("Informe um lembrete com até 500 caracteres.", "INVALID_REMINDER")
            return
        }

        var alarmDate: Date?
        if let notifyAtValue = call.getString("notifyAt") {
            let expected = startsAt.addingTimeInterval(-Double(alertMinutes) * 60)
            guard let parsed = parseDate(notifyAtValue), abs(parsed.timeIntervalSince(expected)) <= 1 else {
                call.reject("O horário do alerta não corresponde à antecedência escolhida.", "INVALID_ALARM")
                return
            }
            alarmDate = parsed
        }

        withPermission(call) {
            // Never adopt an arbitrary identifier supplied by JavaScript. Only IDs
            // recorded after this plugin created/saved a reminder can be updated.
            let existing = self.links[id].flatMap {
                self.eventStore.calendarItem(withIdentifier: $0) as? EKReminder
            }
            let reminder = existing ?? EKReminder(eventStore: self.eventStore)

            if existing == nil {
                guard let calendar = self.eventStore.defaultCalendarForNewReminders()
                    ?? self.eventStore.calendars(for: .reminder).first(where: { $0.allowsContentModifications }) else {
                    call.reject(
                        "Abra o app Lembretes do iPhone, crie uma lista e tente novamente.",
                        "NO_REMINDER_LIST"
                    )
                    return
                }
                reminder.calendar = calendar
                reminder.notes = "Criado pelo Lembrete MS."
            }
            guard reminder.calendar?.allowsContentModifications == true else {
                call.reject("A lista escolhida no Lembretes não permite alterações.", "READ_ONLY_LIST")
                return
            }

            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone.current
            var components = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: startsAt)
            components.calendar = calendar
            components.timeZone = calendar.timeZone
            reminder.title = title
            reminder.startDateComponents = components
            reminder.dueDateComponents = components
            reminder.isCompleted = false

            // Replace the prior alarm when editing; do not fire retroactive alerts.
            let futureAlarm = alarmDate.flatMap { $0 > Date() ? $0 : nil }
            reminder.alarms = futureAlarm.map { [EKAlarm(absoluteDate: $0)] } ?? []

            do {
                try self.eventStore.save(reminder, commit: true)
                var updatedLinks = self.links
                updatedLinks[id] = reminder.calendarItemIdentifier
                self.links = updatedLinks
                call.resolve([
                    "identifier": reminder.calendarItemIdentifier,
                    "created": existing == nil,
                    "alarmScheduled": futureAlarm != nil
                ])
            } catch {
                call.reject("Não foi possível salvar no Lembretes do iPhone. Tente novamente.", "SAVE_FAILED", error)
            }
        }
    }

    @objc func complete(_ call: CAPPluginCall) {
        guard let id = localId(call) else { return }
        withPermission(call) {
            guard let identifier = self.links[id] else {
                call.reject("Este item não está vinculado a um lembrete criado pelo Lembrete MS.", "LINK_NOT_FOUND")
                return
            }
            guard let reminder = self.eventStore.calendarItem(withIdentifier: identifier) as? EKReminder else {
                self.forgetLink(id)
                call.resolve(["completed": false, "missing": true])
                return
            }
            guard reminder.calendar?.allowsContentModifications == true else {
                call.reject("A lista escolhida no Lembretes não permite alterações.", "READ_ONLY_LIST")
                return
            }
            reminder.isCompleted = true
            reminder.alarms = []
            do {
                try self.eventStore.save(reminder, commit: true)
                call.resolve(["completed": true])
            } catch {
                call.reject("Não foi possível concluir o item no Lembretes do iPhone.", "COMPLETE_FAILED", error)
            }
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let id = localId(call) else { return }
        withPermission(call) {
            guard let identifier = self.links[id] else {
                call.reject("Este item não está vinculado a um lembrete criado pelo Lembrete MS.", "LINK_NOT_FOUND")
                return
            }
            guard let reminder = self.eventStore.calendarItem(withIdentifier: identifier) as? EKReminder else {
                self.forgetLink(id)
                call.resolve(["removed": false, "missing": true])
                return
            }
            guard reminder.calendar?.allowsContentModifications == true else {
                call.reject("A lista escolhida no Lembretes não permite alterações.", "READ_ONLY_LIST")
                return
            }
            do {
                try self.eventStore.remove(reminder, commit: true)
                self.forgetLink(id)
                call.resolve(["removed": true])
            } catch {
                call.reject("Não foi possível remover o item no Lembretes do iPhone.", "REMOVE_FAILED", error)
            }
        }
    }

    private func forgetLink(_ id: String) {
        var updatedLinks = links
        updatedLinks.removeValue(forKey: id)
        links = updatedLinks
    }

    @objc func openCalendar(_ call: CAPPluginCall) {
        guard let rawTitle = call.getString("title"),
              let dateValue = call.getString("startsAt"),
              let startsAt = parseDate(dateValue),
              let alertMinutes = call.getInt("alertMinutes"),
              allowedAlertMinutes.contains(alertMinutes) else {
            call.reject("Confira os dados do compromisso.", "INVALID_EVENT")
            return
        }
        let title = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title.count <= 500 else {
            call.reject("Informe um compromisso com até 500 caracteres.", "INVALID_EVENT")
            return
        }

        DispatchQueue.main.async {
            guard self.pendingCalendarCall == nil else {
                call.reject("Conclua o evento já aberto no Calendário.", "CALENDAR_BUSY")
                return
            }
            // Keep the call while permission/editor is open; reject duplicate taps.
            self.pendingCalendarCall = call
            let present = {
                guard let presenter = self.bridge?.viewController,
                      presenter.presentedViewController == nil else {
                    self.pendingCalendarCall = nil
                    call.reject("Feche a janela aberta e tente novamente.", "CALENDAR_BUSY")
                    return
                }
                let event = EKEvent(eventStore: self.eventStore)
                event.title = title
                event.startDate = startsAt
                event.endDate = startsAt.addingTimeInterval(30 * 60)
                event.notes = "Compromisso criado pelo Lembrete MS."
                let alarmDate = startsAt.addingTimeInterval(-Double(alertMinutes) * 60)
                if alarmDate > Date() {
                    event.addAlarm(EKAlarm(absoluteDate: alarmDate))
                }
                let editor = EKEventEditViewController()
                editor.eventStore = self.eventStore
                editor.event = event
                editor.editViewDelegate = self
                // All dismissal must pass through Apple's Add/Cancel actions.
                editor.isModalInPresentation = true
                presenter.present(editor, animated: true)
            }

            if #available(iOS 17.0, *) {
                // EventKitUI runs the editor out of process and handles the write.
                // No calendar read/full-access permission is needed on iOS 17+.
                present()
                return
            }
            let status = EKEventStore.authorizationStatus(for: .event)
            if status == .authorized {
                present()
            } else if status == .notDetermined {
                self.eventStore.requestAccess(to: .event) { granted, error in
                    DispatchQueue.main.async {
                        guard granted && error == nil else {
                            self.pendingCalendarCall = nil
                            call.reject(
                                "Autorize o acesso ao Calendário nos Ajustes do iPhone para adicionar o evento.",
                                "CALENDAR_PERMISSION_DENIED",
                                error
                            )
                            return
                        }
                        present()
                    }
                }
            } else {
                self.pendingCalendarCall = nil
                call.reject(
                    "Autorize o acesso ao Calendário nos Ajustes do iPhone para adicionar o evento.",
                    "CALENDAR_PERMISSION_DENIED"
                )
            }
        }
    }

    public func eventEditViewController(
        _ controller: EKEventEditViewController,
        didCompleteWith action: EKEventEditViewAction
    ) {
        let call = pendingCalendarCall
        pendingCalendarCall = nil
        controller.dismiss(animated: true) {
            call?.resolve(["saved": action == .saved, "cancelled": action != .saved])
        }
    }
}
