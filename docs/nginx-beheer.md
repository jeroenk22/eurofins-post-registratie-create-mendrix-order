# NGINX Reverse Proxy — Beheerhandleiding

## Wat doet NGINX hier?

NGINX draait op de Mendrix-server (`192.168.4.102`) als reverse proxy. Hij ontvangt HTTPS-verkeer op poort 8443 van buitenaf (o.a. van Netlify) en stuurt dat intern door naar de Mendrix REST API op `http://localhost:38000`. Zo gaan API-tokens en foto's versleuteld over het internet.

```
Netlify (cloud) → HTTPS :8443 → NGINX op 192.168.4.102 → HTTP :38000 → Mendrix
```

---

## Bestanden en locaties

| Wat | Waar |
|---|---|
| NGINX executable | `C:\nginx\nginx.exe` |
| Configuratie | `C:\nginx\conf\nginx.conf` |
| SSL-certificaat | `C:\nginx\ssl\cert.pem` |
| SSL-private key | `C:\nginx\ssl\key.pem` |
| Access log | `C:\nginx\logs\access.log` |
| Error log | `C:\nginx\logs\error.log` |
| Windows Taakplanner | "NGINX Reverse Proxy" (start automatisch bij reboot) |

---

## NGINX starten en stoppen

Open **PowerShell als Administrator** op de server.

**Status controleren:**
```powershell
Get-Process nginx -ErrorAction SilentlyContinue
netstat -ano | findstr ":8443"
```

**Starten (via Taakplanner):**
```powershell
Start-ScheduledTask -TaskName "NGINX Reverse Proxy"
```

**Stoppen:**
```powershell
Stop-Process -Name nginx -Force
```

**Config testen na wijziging:**
```powershell
cd C:\nginx
.\nginx.exe -t
```

---

## Logbestanden bekijken

**Laatste 20 regels van de access log:**
```powershell
Get-Content "C:\nginx\logs\access.log" -Tail 20
```

**Laatste 20 regels van de error log:**
```powershell
Get-Content "C:\nginx\logs\error.log" -Tail 20
```

---

## SSL-certificaat vernieuwen

Het wildcard-certificaat `*.ophaaldienstmiedema.nl` verloopt op **4 december 2026**. Vernieuw het ruim van tevoren (bijv. november 2026).

Het nieuwe certificaat wordt beheerd via TransIP en staat in de **Windows Certificate Store** op de server.

### Stap 1 — Controleer het nieuwe certificaat in de Certificate Store

Open PowerShell als Administrator:

```powershell
Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Subject -like "*ophaaldienstmiedema*" } | Select-Object Subject, Thumbprint, NotAfter
```

Noteer de **Thumbprint** van het nieuwe certificaat.

### Stap 2 — Exporteer het nieuwe certificaat als PEM-bestanden

Vervang `<NIEUWE_THUMBPRINT>` door de thumbprint uit stap 1:

```powershell
$thumb = "<NIEUWE_THUMBPRINT>"
$cert = Get-Item "Cert:\LocalMachine\My\$thumb"

$chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
$chain.Build($cert) | Out-Null
$chainPem = ""
foreach ($element in $chain.ChainElements) {
    $b64 = [System.Convert]::ToBase64String($element.Certificate.RawData, [System.Base64FormattingOptions]::InsertLineBreaks)
    $chainPem += "-----BEGIN CERTIFICATE-----`n$b64`n-----END CERTIFICATE-----`n"
}
Set-Content -Path "C:\nginx\ssl\cert.pem" -Value $chainPem -Encoding ASCII

$rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
$keyBytes = $rsa.Key.Export([System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)
$keyBase64 = [System.Convert]::ToBase64String($keyBytes, [System.Base64FormattingOptions]::InsertLineBreaks)
$keyPem = "-----BEGIN PRIVATE KEY-----`n$keyBase64`n-----END PRIVATE KEY-----"
Set-Content -Path "C:\nginx\ssl\key.pem" -Value $keyPem -Encoding ASCII

Write-Host "Certificaat geëxporteerd."
Get-Item "C:\nginx\ssl\*"
```

### Stap 3 — NGINX herladen

```powershell
cd C:\nginx
.\nginx.exe -t
Stop-Process -Name nginx -Force
Start-ScheduledTask -TaskName "NGINX Reverse Proxy"
```

### Stap 4 — Testen

```powershell
curl.exe -k -v "https://127.0.0.1:8443/api/settings/config/global" 2>&1
```

Verwacht: `401 Unauthorized` van Mendrix. Dan werkt alles.

---

## Verbinding testen van buitenaf

Ga in een browser naar:
```
https://customlink.ophaaldienstmiedema.nl:8443/api/settings/config/global
```

Verwacht: `{"error":{"code":401,...}}` — dit betekent NGINX en het certificaat werken correct.

---

## Wat staat er in de Netlify environment variables?

| Variabele | Waarde |
|---|---|
| `MENDRIX_API_URL` | `https://customlink.ophaaldienstmiedema.nl:8443/api/` |
| `MENDRIX_API_TOKEN` | *(zie Netlify dashboard → Site configuration → Environment variables)* |

Na het vernieuwen van het certificaat hoeft er **niets** in Netlify aangepast te worden — de URL blijft hetzelfde.

---

## UniFi port forwarding

In de UniFi router staat een port forwarding regel:
- **Naam:** `nginx-8443 reverse proxy`
- **Poort:** 8443 → `192.168.4.102:8443`

Deze regel mag **nooit** verwijderd worden, anders is de verbinding van Netlify naar NGINX verbroken.
