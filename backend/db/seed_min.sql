INSERT INTO gln_site VALUES ('8437000123456','Secadero #3','secadero');

INSERT INTO lot VALUES ('CURADO-2025Q1','curado','8437000123456');

INSERT INTO animal VALUES ('AN-0001','PED-123','2023-05-10','8437000123456','iberico 50%','bellota');

INSERT INTO piece VALUES ('ITACA-0001-2025','08412345000012','jamon','AN-0001','CURADO-2025Q1');

INSERT INTO iot_reading VALUES (now() - interval '12 hours','8437000123456','CURADO-2025Q1',18.7,71.9,640);

INSERT INTO epcis_event VALUES (
  'ev-0001','ITACA-0001-2025','CURADO-2025Q1', now() - interval '1 hour',
  'TransformationEvent',
  '{"type":"TransformationEvent","action":"OBSERVE","bizStep":"curado:start","readPoint":{"gln":"8437000123456"}}'
);

INSERT INTO dpp_links (gtin, lot, serial, dynamic_id, locked_id)
VALUES ('01234567890128', 'L-SECADERO-2025-10-31', '123456', '0xDYNAMIC_PLACEHOLDER', '0xLOCKED_PLACEHOLDER');
