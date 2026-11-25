package app.wakeme.transit;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import androidx.core.location.LocationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WakeMeSystem")
public class WakeMeSystemPlugin extends Plugin {

    private JSObject buildStatusSnapshot() {
        Context ctx = getContext();
        String pkg = ctx.getPackageName();

        boolean ignoringBattery = true;
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            ignoringBattery = pm.isIgnoringBatteryOptimizations(pkg);
        }

        boolean gpsEnabled = true;
        LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        if (lm != null) {
            gpsEnabled = LocationManagerCompat.isLocationEnabled(lm);
        }

        boolean exactAlarms = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                exactAlarms = am.canScheduleExactAlarms();
            }
        }

        JSObject ret = new JSObject();
        ret.put("isIgnoringBatteryOptimizations", ignoringBattery);
        ret.put("gpsProviderEnabled", gpsEnabled);
        ret.put("canScheduleExactAlarms", exactAlarms);
        return ret;
    }

    @PluginMethod
    public void getSystemStatus(PluginCall call) {
        call.resolve(buildStatusSnapshot());
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        Context ctx = getContext();
        String pkg = ctx.getPackageName();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && pm.isIgnoringBatteryOptimizations(pkg)) {
            call.resolve(buildStatusSnapshot());
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + pkg));
                startActivityForResult(call, intent, "onSystemSettingsResult");
                return;
            } catch (Exception ignored) {
                // Fall back to general battery optimization settings if OEM blocks direct dialog
            }
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                startActivityForResult(call, fallback, "onSystemSettingsResult");
                return;
            } catch (Exception ignored) {
                // Fall through to App Info
            }
        }
        openAppSettings(call);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            startActivityForResult(call, intent, "onSystemSettingsResult");
        } catch (Exception ex) {
            call.reject("Unable to open App Settings: " + ex.getMessage());
        }
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            startActivityForResult(call, intent, "onSystemSettingsResult");
        } catch (Exception ex) {
            openAppSettings(call);
        }
    }

    @PluginMethod
    public void setAlarmScreenMode(PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        if (getActivity() == null) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    getActivity().setShowWhenLocked(enabled);
                    getActivity().setTurnScreenOn(enabled);
                }
                if (enabled) {
                    getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            } catch (Exception ignored) {
                // Safe no-op on restricted devices
            }
            call.resolve();
        });
    }

    @ActivityCallback
    private void onSystemSettingsResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        call.resolve(buildStatusSnapshot());
    }
}
