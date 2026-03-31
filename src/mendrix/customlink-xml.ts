import type { OrderData } from "./types.js";
import { fmt, xmlEscape } from "./xml-utils.js";

function buildGoodsXml(goederen: OrderData["goederen"]): string {
  return goederen
    .map((g, i) => {
      const goodId = -(i + 1);
      const packingTag = g.verpakking
        ? `<Packing Type="TEoPackingMx"><Name>${xmlEscape(g.verpakking)}</Name></Packing>`
        : "";
      return `
                    <EoGoodMx Type="TEoGoodMx">
                        <GoodId Type="TEoKeyIntInfraMx"><Id>${goodId}</Id></GoodId>
                        <Barcode>${xmlEscape(g.barcode)}</Barcode>
                        <Comments>${xmlEscape(g.opmerkingen)}</Comments>
                        <Depth>${fmt(g.lengte, 4)}</Depth>
                        <Height>${fmt(g.hoogte, 4)}</Height>
                        <Width>${fmt(g.breedte, 4)}</Width>
                        ${packingTag}
                        <Parts>${fmt(g.aantal, 1)}</Parts>
                        <Volume>${fmt(g.volume, 4)}</Volume>
                        <VolumeWeight>${fmt(g.volumegewicht, 2)}</VolumeWeight>
                        <Weight>${fmt(g.gewicht, 2)}</Weight>
                        <LoadMeters>${fmt(g.laadmeters, 4)}</LoadMeters>
                        <Identification>${xmlEscape(g.identificatie)}</Identification>
                        <ArticleWeight>0.0</ArticleWeight>
                    </EoGoodMx>`;
    })
    .join("");
}

function buildGoodsToTasksXml(count: number): string {
  return Array.from({ length: count }, (_, i) => `
                    <EoGoodToTaskMx Type="TEoGoodToTaskMx">
                        <GoodId Type="TEoKeyIntInfraMx"><Id>${-(i + 1)}</Id></GoodId>
                        <TaskId Type="TEoKeyIntInfraMx"><Id>-1001</Id></TaskId>
                    </EoGoodToTaskMx>`).join("");
}

export function buildCustomLinkXml(order: OrderData): string {
  const ts = order.moment ?? new Date().toISOString().slice(0, 19);
  const { adres } = order;

  return `<?xml version="1.0" encoding="windows-1252"?>
<EoCustomLinkStoreOrdersNormal Type="TEoCustomLinkStoreOrdersNormal"
    xsi:noNamespaceSchemaLocation="GdxEoStructures.xsd"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ApplyImportSettings>True</ApplyImportSettings>
    <Data Type="TEoOrderMxList">
        <_TEoListBase_Items>
            <EoOrderMx Type="TEoOrderMx">
                <OrderId Type="TEoKeyIntInfraMx"><Id>-1000</Id></OrderId>
                <ClientId Type="TEoKeyIntInfraMx"><Id>${order.clientId}</Id></ClientId>
                <Contact>${xmlEscape(order.contact)}</Contact>
                <Moment>${xmlEscape(ts)}</Moment>
                <Reference>${xmlEscape(order.reference)}</Reference>
                <ReferenceYour>${xmlEscape(order.referenceYour)}</ReferenceYour>
                <Diversen>${xmlEscape(order.diversen)}</Diversen>
                ${order.productId !== undefined
    ? `<ProductId Type="TEoKeyIntInfraMx"><Id>${order.productId}</Id></ProductId>`
    : "<ProductIdAutomaticArticles>True</ProductIdAutomaticArticles>"
  }

                <Goods Type="TEoGoodMxList">
                    <_TEoListBase_Items>${buildGoodsXml(order.goederen)}
                    </_TEoListBase_Items>
                </Goods>

                <Tasks Type="TEoTaskMxList">
                    <_TEoListBase_Items>
                        <EoTaskMx Type="TEoTaskMx">
                            <TaskId Type="TEoKeyIntInfraMx"><Id>-1001</Id></TaskId>
                            <TaskTypeId Type="TEoKeyIntInfraMx"><Id>${order.taakType}</Id></TaskTypeId>
                            <Address Type="TEoAddress">
                                <Name>${xmlEscape(adres.naam)}</Name>
                                <Premise>${xmlEscape(adres.locatie)}</Premise>
                                <Street>${xmlEscape(adres.straat)}</Street>
                                <Number>${xmlEscape(adres.huisnummer)}</Number>
                                <PostalCode>${xmlEscape(adres.postcode)}</PostalCode>
                                <Place>${xmlEscape(adres.plaats)}</Place>
                                <Country>${xmlEscape(adres.land ?? "Nederland")}</Country>
                                <CountryCode>${xmlEscape(adres.landcode ?? "NL")}</CountryCode>
                            </Address>
                            <Requested Type="TEoDateTimeWindow">
                                <DateTimeBegin>${xmlEscape(order.gewenstVan)}</DateTimeBegin>
                                <DateTimeEnd>${xmlEscape(order.gewenstTot)}</DateTimeEnd>
                            </Requested>
                            <Instructions>${xmlEscape(order.instructies)}</Instructions>
                            <TrackAndTrace>${xmlEscape(order.trackTrace)}</TrackAndTrace>
                        </EoTaskMx>
                    </_TEoListBase_Items>
                </Tasks>

                <GoodsToTasks Type="TEoGoodToTaskMxList">
                    <_TEoListBase_Items>${buildGoodsToTasksXml(order.goederen.length)}
                    </_TEoListBase_Items>
                </GoodsToTasks>

            </EoOrderMx>
        </_TEoListBase_Items>
    </Data>
</EoCustomLinkStoreOrdersNormal>`;
}
