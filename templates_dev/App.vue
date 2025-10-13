<template>
    <div id="app">
        <WhoIs v-bind="domainInfo" />
    </div>
</template>

<script setup>
import WhoIs from "../plugins/ym/whois.vue";

const domainInfo = {
    "is_available": 0,
    "domain": "whoiscx.com",
    "domain_suffix": "com",
    "query_time": "2025-06-20 06:06:32",
    "info": {
        "domain": "whoiscx.com",
        "registrant_name": "",
        "registrant_email": "",
        "registrar_name": "Alibaba Cloud Computing Ltd. d/b/a HiChina (www.net.cn)",
        "creation_time": "2012-04-25 12:36:40",
        "expiration_time": "2026-04-25 12:36:40",
        "creation_days": 4803,
        "valid_days": 309,
        "is_expire": 0,
        "domain_status": [
            "ok （正常）"
        ],
        "name_server": [
            "DNS25.HICHINA.COM",
            "DNS26.HICHINA.COM"
        ],
        "whois_server": "grs-whois.hichina.com"
    },
    "raw": "Domain Name: WHOISCX.COM\r\n   Registry Domain ID: 1715893795_DOMAIN_COM-VRSN\r\n   Registrar WHOIS Server: grs-whois.hichina.com\r\n   Registrar URL: http://wanwang.aliyun.com\r\n   Updated Date: 2025-04-11T12:59:33Z\r\n   Creation Date: 2012-04-25T10:36:40Z\r\n   Registry Expiry Date: 2026-04-25T10:36:40Z\r\n   Registrar: Alibaba Cloud Computing Ltd. d/b/a HiChina (www.net.cn)\r\n   Registrar IANA ID: 1599\r\n   Registrar Abuse Contact Email: DomainAbuse@service.aliyun.com\r\n   Registrar Abuse Contact Phone: +86.95187\r\n   Domain Status: ok https://icann.org/epp#ok\r\n   Name Server: DNS25.HICHINA.COM\r\n   Name Server: DNS26.HICHINA.COM\r\n   DNSSEC: unsigned\r\n   URL of the ICANN Whois Inaccuracy Complaint Form: https://www.icann.org/wicf/\r\n>>> Last update of whois database: 2025-06-20T04:06:22Z <<<"
}
</script>
