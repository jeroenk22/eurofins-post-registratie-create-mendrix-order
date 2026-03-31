"""
mendrix_create_order.py
-----------------------
Maakt een nieuwe order aan in MendriX via Custom Link SOAP over HTTP.

Gebruik:
    pip install requests
    python mendrix_create_order.py
"""

import re
from dataclasses import dataclass, field
from datetime import datetime
from xml.sax.saxutils import escape as xml_escape

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


# ---------------------------------------------------------------------------
# Configuratie
# ---------------------------------------------------------------------------
SOAP_HOST = "195.222.119.185"
SOAP_PORT = 5562
SOAP_URL  = f"http://{SOAP_HOST}:{SOAP_PORT}/soap/ICustomLinkSoap"

SOAP_USER = "lXd5[XzBJ5?i20"
SOAP_PASS = "2#A06Q{gs8XCnm"

TIMEOUT   = 15


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class Adres:
    naam:       str = ""
    locatie:    str = ""
    straat:     str = ""
    huisnummer: str = ""
    postcode:   str = ""
    plaats:     str = ""
    land:       str = "Nederland"
    landcode:   str = "NL"


@dataclass
class Goed:
    barcode:       str   = ""
    verpakking:    str   = ""
    aantal:        float = 1.0
    gewicht:       float = 0.0
    volume:        float = 0.0
    volumegewicht: float = 0.0
    laadmeters:    float = 0.0
    lengte:        float = 0.0
    breedte:       float = 0.0
    hoogte:        float = 0.0
    identificatie: str   = ""
    opmerkingen:   str   = ""


@dataclass
class OrderData:
    client_id:   int   = 0
    contact:     str   = ""
    reference:   str   = ""
    diversen:    str   = ""
    moment:      str   = ""

    taak_type:   int   = 2
    adres:       Adres = field(default_factory=Adres)
    gewenst_van: str   = ""
    gewenst_tot: str   = ""
    instructies: str   = ""
    track_trace: str   = ""

    goederen:    list  = field(default_factory=list)


# ---------------------------------------------------------------------------
# Custom Link XML bouwen
# ---------------------------------------------------------------------------

def _e(value) -> str:
    return xml_escape(str(value))


def bouw_custom_link_xml(order: OrderData) -> str:
    moment = order.moment or datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

    goods_blokken = []
    for i, g in enumerate(order.goederen):
        good_id = -(i + 1)
        packing_tag = ""
        if g.verpakking:
            # <Name> is de juiste tag conform MendriX XML structure docs
            packing_tag = '<Packing Type="TEoPackingMx"><Name>' + _e(g.verpakking) + '</Name></Packing>'

        goods_blokken.append(
            "\n                    <EoGoodMx Type=\"TEoGoodMx\">"
            "\n                        <GoodId Type=\"TEoKeyIntInfraMx\"><Id>" + str(good_id) + "</Id></GoodId>"
            "\n                        <Barcode>" + _e(g.barcode) + "</Barcode>"
            "\n                        <Comments>" + _e(g.opmerkingen) + "</Comments>"
            "\n                        <Depth>" + f"{g.lengte:.4f}" + "</Depth>"
            "\n                        <Height>" + f"{g.hoogte:.4f}" + "</Height>"
            "\n                        <Width>" + f"{g.breedte:.4f}" + "</Width>"
            "\n                        " + packing_tag +
            "\n                        <Parts>" + f"{g.aantal:.1f}" + "</Parts>"
            "\n                        <Volume>" + f"{g.volume:.4f}" + "</Volume>"
            "\n                        <VolumeWeight>" + f"{g.volumegewicht:.2f}" + "</VolumeWeight>"
            "\n                        <Weight>" + f"{g.gewicht:.2f}" + "</Weight>"
            "\n                        <LoadMeters>" + f"{g.laadmeters:.4f}" + "</LoadMeters>"
            "\n                        <Identification>" + _e(g.identificatie) + "</Identification>"
            "\n                        <ArticleWeight>0.0</ArticleWeight>"
            "\n                    </EoGoodMx>"
        )

    goods_xml = "".join(goods_blokken)

    g2t_blokken = "".join(
        "\n                    <EoGoodToTaskMx Type=\"TEoGoodToTaskMx\">"
        "\n                        <GoodId Type=\"TEoKeyIntInfraMx\"><Id>" + str(-(i+1)) + "</Id></GoodId>"
        "\n                        <TaskId Type=\"TEoKeyIntInfraMx\"><Id>-1001</Id></TaskId>"
        "\n                    </EoGoodToTaskMx>"
        for i in range(len(order.goederen))
    )

    # Adres naam: <Name> conform MendriX XML structure docs
    adres_naam_tag = "<Name>" + _e(order.adres.naam) + "</Name>"

    xml_lines = [
        '<?xml version="1.0" encoding="windows-1252"?>',
        '<EoCustomLinkStoreOrdersNormal Type="TEoCustomLinkStoreOrdersNormal"',
        '    xsi:noNamespaceSchemaLocation="GdxEoStructures.xsd"',
        '    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
        '    <ApplyImportSettings>True</ApplyImportSettings>',
        '    <Data Type="TEoOrderMxList">',
        '        <_TEoListBase_Items>',
        '            <EoOrderMx Type="TEoOrderMx">',
        '                <OrderId Type="TEoKeyIntInfraMx"><Id>-1000</Id></OrderId>',
        '                <ClientId Type="TEoKeyIntInfraMx"><Id>' + str(order.client_id) + '</Id></ClientId>',
        '                <Contact>' + _e(order.contact) + '</Contact>',
        '                <Moment>' + _e(moment) + '</Moment>',
        '                <Reference>' + _e(order.reference) + '</Reference>',
        '                <Diversen>' + _e(order.diversen) + '</Diversen>',
        '                <ProductIdAutomaticArticles>True</ProductIdAutomaticArticles>',
        '',
        '                <Goods Type="TEoGoodMxList">',
        '                    <_TEoListBase_Items>' + goods_xml,
        '                    </_TEoListBase_Items>',
        '                </Goods>',
        '',
        '                <Tasks Type="TEoTaskMxList">',
        '                    <_TEoListBase_Items>',
        '                        <EoTaskMx Type="TEoTaskMx">',
        '                            <TaskId Type="TEoKeyIntInfraMx"><Id>-1001</Id></TaskId>',
        '                            <TaskTypeId Type="TEoKeyIntInfraMx"><Id>' + str(order.taak_type) + '</Id></TaskTypeId>',
        '                            <Address Type="TEoAddress">',
        '                                ' + adres_naam_tag,
        '                                <Premise>' + _e(order.adres.locatie) + '</Premise>',
        '                                <Street>' + _e(order.adres.straat) + '</Street>',
        '                                <Number>' + _e(order.adres.huisnummer) + '</Number>',
        '                                <PostalCode>' + _e(order.adres.postcode) + '</PostalCode>',
        '                                <Place>' + _e(order.adres.plaats) + '</Place>',
        '                                <Country>' + _e(order.adres.land) + '</Country>',
        '                                <CountryCode>' + _e(order.adres.landcode) + '</CountryCode>',
        '                            </Address>',
        '                            <Requested Type="TEoDateTimeWindow">',
        '                                <DateTimeBegin>' + _e(order.gewenst_van) + '</DateTimeBegin>',
        '                                <DateTimeEnd>' + _e(order.gewenst_tot) + '</DateTimeEnd>',
        '                            </Requested>',
        '                            <Instructions>' + _e(order.instructies) + '</Instructions>',
        '                            <TrackAndTrace>' + _e(order.track_trace) + '</TrackAndTrace>',
        '                        </EoTaskMx>',
        '                    </_TEoListBase_Items>',
        '                </Tasks>',
        '',
        '                <GoodsToTasks Type="TEoGoodToTaskMxList">',
        '                    <_TEoListBase_Items>' + g2t_blokken,
        '                    </_TEoListBase_Items>',
        '                </GoodsToTasks>',
        '',
        '            </EoOrderMx>',
        '        </_TEoListBase_Items>',
        '    </Data>',
        '</EoCustomLinkStoreOrdersNormal>',
    ]

    return "\n".join(xml_lines)


# ---------------------------------------------------------------------------
# SOAP envelope
# ---------------------------------------------------------------------------

def bouw_soap_envelope(custom_link_xml: str, user: str, password: str) -> str:
    escaped_request = xml_escape(custom_link_xml)
    return (
        '<?xml version="1.0"?>\n'
        '<soap-env:Envelope\n'
        '    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n'
        '    xmlns:xsd="http://www.w3.org/2001/XMLSchema"\n'
        '    xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"\n'
        '    xmlns:urn="urn:UCoSoapDispatcherCustomLink-ICustomLinkSoap">\n'
        '    <soap-env:Header xmlns:NS-1="urn:UCoSoapDispatcherBase">\n'
        '        <NS-1:TAuthenticationHeader xsi:type="urn:TAuthenticationHeader"\n'
        '            xmlns:urn="urn:UCoSoapDispatcherBase">\n'
        '            <UserName xsi:type="xsd:string">' + xml_escape(user) + '</UserName>\n'
        '            <Password xsi:type="xsd:string">' + xml_escape(password) + '</Password>\n'
        '        </NS-1:TAuthenticationHeader>\n'
        '    </soap-env:Header>\n'
        '    <soap-env:Body>\n'
        '        <urn:ExecuteRequest soap-env:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\n'
        '            <ARequest xsi:type="xsd:string">' + escaped_request + '</ARequest>\n'
        '        </urn:ExecuteRequest>\n'
        '    </soap-env:Body>\n'
        '</soap-env:Envelope>'
    )


# ---------------------------------------------------------------------------
# SOAP versturen + parsen
# ---------------------------------------------------------------------------

def stuur_soap(soap_envelope: str) -> str:
    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": '"urn:UCoSoapDispatcherCustomLink-ICustomLinkSoap#ExecuteRequest"',
    }
    response = requests.post(
        SOAP_URL,
        data=soap_envelope.encode("utf-8"),
        headers=headers,
        timeout=TIMEOUT,
        verify=False,
    )
    response.raise_for_status()
    return response.text


def extraheer_custom_link_response(soap_response: str) -> str:
    for tag in ("return", "ExecuteRequestResult", "AResult"):
        m = re.search(rf"<[^>]*{tag}[^>]*>(.*?)<\/[^>]*{tag}>", soap_response, re.DOTALL)
        if m:
            inner = m.group(1)
            return (inner
                    .replace("&lt;", "<").replace("&gt;", ">")
                    .replace("&amp;", "&").replace("&quot;", '"')
                    .replace("&apos;", "'"))
    return soap_response


def parse_resultaat(cl_response: str) -> list[dict]:
    resultaten = []
    for match in re.finditer(r"<EoStoreResult[^>]*>(.*?)</EoStoreResult>", cl_response, re.DOTALL):
        blok = match.group(1)

        def _get(tag, b=blok):
            m = re.search(rf"<{tag}>(.*?)</{tag}>", b)
            return m.group(1).strip() if m else ""

        resultaten.append({
            "id":          _get("Id"),
            "id_oud":      _get("IdOld"),
            "resultaat":   _get("StoreResult"),
            "omschrijving":_get("StoreDescription"),
        })
    return resultaten


# ---------------------------------------------------------------------------
# Testorder
# ---------------------------------------------------------------------------

def maak_test_order() -> OrderData:
    return OrderData(
        client_id   = 3699,
        contact     = "",
        reference   = "",
        diversen    = "",
        moment      = "2026-03-24T08:00:00",

        taak_type   = 2,
        adres       = Adres(
            naam        = "Eurofins BLGG",
            locatie     = "Bij de roldeur direct rechts bij de stelling",
            straat      = "Binnenhaven",
            huisnummer  = "5",
            postcode    = "6709PD",
            plaats      = "Wageningen",
            land        = "Nederland",
            landcode    = "NL",
        ),
        gewenst_van = "2026-03-24T08:00:00",
        gewenst_tot = "2026-03-24T23:59:00",
        instructies = "Dit is Jeroen's eerste testorder!",
        track_trace = "MXTTFB4BC3692142F0EF",

        goederen    = [
            Goed(
                verpakking    = "Doosje sealrollen",
                aantal        = 1.0,
                volume        = 0.0054,
                volumegewicht = 0.90,
                laadmeters    = 0.0187,
                lengte        = 25.0,
                breedte       = 18.0,
                hoogte        = 12.0,
            )
        ],
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    order = maak_test_order()

    cl_xml = bouw_custom_link_xml(order)
    print("=== Custom Link XML ===")
    print(cl_xml)
    print()

    soap = bouw_soap_envelope(cl_xml, SOAP_USER, SOAP_PASS)

    print(f"Versturen naar {SOAP_URL} ...")
    try:
        raw_response = stuur_soap(soap)
        cl_response = extraheer_custom_link_response(raw_response)

        print("=== Custom Link response ===")
        print(cl_response)
        print()

        resultaten = parse_resultaat(cl_response)
        if resultaten:
            print("=== Resultaat ===")
            for r in resultaten:
                ok = r["resultaat"] in ("srInserted", "srUpdated")
                status = "OK" if ok else "FOUT"
                print(f"{status}  |  Nieuw ID: {r['id']}  |  {r['resultaat']}", end="")
                if r["omschrijving"]:
                    print(f"  ->  {r['omschrijving']}", end="")
                print()
        else:
            print("Geen StoreResult — mogelijk een fout:")
            print(cl_response)

    except requests.exceptions.ConnectionError as e:
        print(f"[FOUT] Verbinding mislukt: {e}")
    except requests.exceptions.HTTPError as e:
        print(f"[FOUT] HTTP {e.response.status_code}: {e.response.text}")
    except Exception as e:
        print(f"[FOUT] {type(e).__name__}: {e}")