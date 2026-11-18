import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import * as Drawing from './drawing.js';
import { fetchWeather } from './openweather.js';
import { getLanguage, textFor } from './language.js';

export const WeatherWidget = GObject.registerClass(
class WeatherWidget extends St.DrawingArea {
    _init(settings) {
        super._init({
            width: 340,
            height: 236,
            reactive: true,
            track_hover: true,
        });

        this._settings = settings;
        const language = getLanguage(settings);
        this._weatherData = {
            city: settings.get_string('weather-city') || (language === 'vi' ? 'Đang xác định vị trí…' : 'Detecting location…'),
            date: language === 'vi' ? 'Đang tải…' : 'Loading…',
            temp: '--',
            high: '--',
            low: '--',
            feels: '--',
            humidity: '--',
            wind: '--',
            condition: language === 'vi' ? 'Đang kết nối…' : 'Connecting…',
            iconPath: null,
        };

        this.connect('repaint', this._onRepaint.bind(this));

        // Click to refresh or open weather
        this.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) { // Left click
                this.refreshWeather();
                try {
                    const app = Gio.AppInfo.get_default_for_type('x-scheme-handler/weather', false);
                    if (app) app.launch([], null);
                } catch (e) {
                    // ignore
                }
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this.refreshWeather();

        // Interval
        const intervalMinutes = Math.max(5, settings.get_int('weather-update-interval') || 15);
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, intervalMinutes * 60, () => {
            this.refreshWeather();
            return GLib.SOURCE_CONTINUE;
        });

        // Listen for setting changes
        this._cityChangeId = settings.connect('changed::weather-city', () => this.refreshWeather());
        this._apiKeyChangeId = settings.connect('changed::weather-api-key', () => this.refreshWeather());
    }

    async refreshWeather() {
        try {
            const data = await fetchWeather({
                weatherApiKey: this._settings.get_string('weather-api-key'),
                weatherCity: this._settings.get_string('weather-city'),
                weatherLat: this._settings.get_double('weather-lat'),
                weatherLon: this._settings.get_double('weather-lon'),
                language: getLanguage(this._settings),
            });
            this._weatherData = data;
            this.queue_repaint();
        } catch (e) {
            console.error('[UbuntuTahoeWidgets] Error refreshing weather:', e);
        }
    }

    _onRepaint(area) {
        const cr = area.get_context();
        const width = 340;
        Drawing.drawLiquidGlassCard(cr, 0, 0, width, 236, 26);

        const d = this._weatherData;
        const language = getLanguage(this._settings);
        const forecasts = (d.hourlyForecast || []).slice(0, 6);
        const label = textFor(language, 'Theo giờ', 'Hourly forecast');
        Drawing.drawText(cr, 20, 27, d.city || 'Hà Nội', 14, Drawing.COLORS.white, true, 'left', 'SF Pro Display');
        Drawing.drawText(cr, 20, 43, d.date || '', 8.5, Drawing.COLORS.weatherMuted, false, 'left');
        Drawing.drawText(cr, 20, 99, `${d.temp || '--'}°`, 48, Drawing.COLORS.white, true, 'left', 'SF Pro Display');
        Drawing.drawText(cr, 20, 117, d.condition || textFor(language, 'Đang tải…', 'Loading…'), 10, Drawing.COLORS.weatherSub, false);

        Drawing.drawImage(cr, d.iconPath, width - 80, 29, 48);
        Drawing.drawText(
            cr, width - 18, 87,
            `${textFor(language, 'C:', 'H:')}${d.high || '--'}°  ${textFor(language, 'T:', 'L:')}${d.low || '--'}°`,
            9, Drawing.COLORS.weatherSub, false, 'right'
        );

        cr.setSourceRGBA(1, 1, 1, 0.12);
        cr.setLineWidth(1);
        cr.moveTo(20, 127);
        cr.lineTo(width - 20, 127);
        cr.stroke();
        Drawing.drawText(cr, 20, 140, label, 8, Drawing.COLORS.weatherMuted, false);

        const forecastWidth = (width - 40) / 6;
        for (let index = 0; index < 6; index++) {
            const forecast = forecasts[index];
            const centerX = 20 + forecastWidth * (index + 0.5);
            Drawing.drawText(
                cr, centerX, 157,
                forecast?.time || '--',
                8, Drawing.COLORS.weatherSub, false, 'center'
            );
            if (forecast?.iconPath) {
                Drawing.drawImage(cr, forecast.iconPath, centerX - 10, 161, 20);
            }
            Drawing.drawText(
                cr, centerX, 194,
                forecast ? `${forecast.temp}°` : '--',
                9, Drawing.COLORS.white, true, 'center'
            );
        }

        cr.setSourceRGBA(1, 1, 1, 0.10);
        cr.moveTo(20, 204);
        cr.lineTo(width - 20, 204);
        cr.stroke();
        Drawing.drawText(
            cr, 20, 221,
            `${textFor(language, 'Cảm giác', 'Feels')} ${d.feels || '--'}°  ·  ${textFor(language, 'Ẩm', 'Humidity')} ${d.humidity || '--'}%`,
            8, Drawing.COLORS.weatherMuted, false
        );
        Drawing.drawText(
            cr, width - 20, 221,
            `${textFor(language, 'Gió', 'Wind')} ${d.wind || '--'} km/h`,
            8, Drawing.COLORS.weatherMuted, false, 'right'
        );
    }

    destroy() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
        if (this._cityChangeId) {
            this._settings.disconnect(this._cityChangeId);
            this._cityChangeId = null;
        }
        if (this._apiKeyChangeId) {
            this._settings.disconnect(this._apiKeyChangeId);
            this._apiKeyChangeId = null;
        }
        super.destroy();
    }
});
