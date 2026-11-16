import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import * as Drawing from './drawing.js';
import { getLanguage, textFor } from './language.js';

const session = new Soup.Session();

function requestHolidays(year, country) {
    return new Promise((resolve, reject) => {
        const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${encodeURIComponent(country)}`;
        const message = Soup.Message.new('GET', url);
        message.request_headers.append('User-Agent', 'UbuntuTahoeWidgets/1.0');

        session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (source, result) => {
            try {
                const bytes = session.send_and_read_finish(result);
                if (message.status_code !== 200) {
                    reject(new Error(`HTTP ${message.status_code}`));
                    return;
                }
                const text = new TextDecoder('utf-8').decode(bytes.toArray());
                const holidays = JSON.parse(text);
                if (!Array.isArray(holidays)) {
                    reject(new Error('Invalid public holiday response'));
                    return;
                }
                resolve(holidays);
            } catch (error) {
                reject(error);
            }
        });
    });
}

export const CalendarWidget = GObject.registerClass(
class CalendarWidget extends St.DrawingArea {
    _init(settings) {
        super._init({
            width: 340,
            height: 270,
            reactive: true,
            track_hover: true,
        });

        this._settings = settings;
        this._holidays = [];
        this._holidayLoading = true;
        this._holidayError = false;
        this._refreshToken = 0;
        this._loadedCountry = null;
        this._loadedYear = null;
        this.connect('repaint', this._onRepaint.bind(this));
        this.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                try {
                    const app = Gio.AppInfo.create_from_commandline('gnome-calendar', null, Gio.AppInfoCreateFlags.NONE);
                    if (app) app.launch([], null);
                } catch (error) {
                    console.error('[UbuntuTahoeWidgets] Could not open GNOME Calendar:', error);
                }
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._countryChangeId = settings.connect('changed::holiday-country', () => this._refreshHolidays());
        this._refreshHolidays();
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 86400, () => {
            const country = this._settings.get_string('holiday-country') || 'VN';
            const year = new Date().getFullYear();
            if (country !== this._loadedCountry || year !== this._loadedYear)
                this._refreshHolidays();
            else
                this.queue_repaint();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _refreshHolidays() {
        const country = this._settings.get_string('holiday-country') || 'VN';
        const year = new Date().getFullYear();
        const token = ++this._refreshToken;
        this._holidays = [];
        this._holidayLoading = true;
        this._holidayError = false;
        this.queue_repaint();

        try {
            const holidays = await requestHolidays(year, country);
            if (token !== this._refreshToken) return;
            this._holidays = holidays;
            this._loadedCountry = country;
            this._loadedYear = year;
            this._holidayLoading = false;
            this.queue_repaint();
        } catch (error) {
            if (token !== this._refreshToken) return;
            this._holidayLoading = false;
            this._holidayError = true;
            console.error(`[UbuntuTahoeWidgets] Could not load ${country} public holidays:`, error);
            this.queue_repaint();
        }
    }

    _onRepaint(area) {
        const cr = area.get_context();
        const width = 340;
        const height = 270;
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const today = now.getDate();
        const language = getLanguage(this._settings);
        const locale = language === 'vi' ? 'vi-VN' : 'en-US';
        const country = this._settings.get_string('holiday-country') || 'VN';
        const countryName = new Intl.DisplayNames([locale], { type: 'region' }).of(country) || country;
        const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(now);
        const holidayByDate = new Map(this._holidays.map(holiday => [holiday.date, holiday]));

        Drawing.drawLiquidGlassCard(cr, 0, 0, width, height, 26);
        Drawing.drawText(cr, 20, 28, textFor(language, 'Kalender', 'Calendar'), 14, Drawing.COLORS.sysText, true, 'left', 'SF Pro Display');
        Drawing.drawText(cr, width - 20, 28, countryName, 9, Drawing.COLORS.sysMuted, false, 'right');
        Drawing.drawText(cr, 20, 53, monthName, 13, Drawing.COLORS.sysText, true, 'left', 'SF Pro Display');

        const cellWidth = (width - 40) / 7;
        for (let column = 0; column < 7; column++) {
            const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
                .format(new Date(2024, 0, column + 1));
            Drawing.drawText(cr, 20 + cellWidth * (column + 0.5), 78, weekday, 8, Drawing.COLORS.sysMuted, false, 'center');
        }

        const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
        const firstVisibleDate = new Date(year, month, 1 - firstWeekday);

        for (let index = 0; index < 42; index++) {
            const date = new Date(firstVisibleDate.getFullYear(), firstVisibleDate.getMonth(), firstVisibleDate.getDate() + index);
            if (date.getMonth() !== month) continue;

            const column = index % 7;
            const row = Math.floor(index / 7);
            const centerX = 20 + cellWidth * (column + 0.5);
            const centerY = 101 + row * 22;
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const holiday = holidayByDate.get(dateKey);

            if (date.getDate() === today) {
                cr.setSourceRGBA(0.27, 0.57, 0.98, 0.78);
                cr.arc(centerX, centerY - 4, 12, 0, 2 * Math.PI);
                cr.fill();
            }

            const dayColor = holiday
                ? Drawing.COLORS.orange
                : date.getDate() === today ? Drawing.COLORS.white : Drawing.COLORS.sysText;
            Drawing.drawText(cr, centerX, centerY, String(date.getDate()), 9, dayColor, date.getDate() === today || !!holiday, 'center');

            if (holiday) {
                cr.setSourceRGBA(...Drawing.COLORS.orange);
                cr.arc(centerX, centerY + 6, 1.4, 0, 2 * Math.PI);
                cr.fill();
            }
        }

        cr.setSourceRGBA(1, 1, 1, 0.12);
        cr.setLineWidth(1);
        cr.moveTo(20, 239);
        cr.lineTo(width - 20, 239);
        cr.stroke();

        const todayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(today).padStart(2, '0')}`;
        const nextHoliday = this._holidays
            .filter(holiday => holiday.date >= todayKey)
            .sort((a, b) => a.date.localeCompare(b.date))[0];
        let footer;
        if (this._holidayLoading) {
            footer = textFor(language, 'Memuat hari libur…', 'Loading public holidays…');
        } else if (this._holidayError) {
            footer = textFor(language, 'Không thể tải lịch nghỉ lễ', 'Holiday data unavailable');
        } else if (nextHoliday) {
            const holidayName = language === 'vi'
                ? (nextHoliday.localName || nextHoliday.name)
                : (nextHoliday.name || nextHoliday.localName);
            const shortName = holidayName.length > 39 ? `${holidayName.slice(0, 36)}…` : holidayName;
            footer = `${nextHoliday.date.slice(5)}  ·  ${shortName}`;
        } else {
            footer = textFor(language, 'Không có ngày lễ sắp tới', 'No upcoming public holidays');
        }
        Drawing.drawText(cr, 20, 257, footer, 8.5, this._holidayError ? Drawing.COLORS.orange : Drawing.COLORS.sysSub, false);
    }

    destroy() {
        this._refreshToken++;
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
        if (this._countryChangeId) {
            this._settings.disconnect(this._countryChangeId);
            this._countryChangeId = null;
        }
        super.destroy();
    }
});
