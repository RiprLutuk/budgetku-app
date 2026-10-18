CREATE TABLE budget_revision_0004_households AS
WITH previous_budget(name,pct,sort_order) AS (
  VALUES
    ('Kontrakan / Rumah',25,0),
    ('Makan Harian',12,1),
    ('Belanja Bulanan',8,2),
    ('Pendidikan',10,3),
    ('Transport',7,4),
    ('Tagihan & Utilitas',5,5),
    ('Kesehatan',3,6),
    ('Dana Darurat',10,7),
    ('Target Rumah',8,8),
    ('Target Mobil',5,9),
    ('Target Umroh',4,10),
    ('Lifestyle',3,11)
)
SELECT category.household_id
FROM categories category
JOIN previous_budget ON lower(trim(category.name))=lower(previous_budget.name)
  AND category.pct=previous_budget.pct
  AND category.sort_order=previous_budget.sort_order
GROUP BY category.household_id
HAVING COUNT(DISTINCT previous_budget.name)=12
  AND (SELECT COUNT(*) FROM categories saved WHERE saved.household_id=category.household_id)=12;

INSERT INTO categories(id,household_id,name,pct,sort_order)
SELECT lower(hex(randomblob(16))),household_id,'Kopi & Jajan Kerja',3,2
FROM budget_revision_0004_households;

UPDATE categories
SET name=CASE lower(trim(name))
  WHEN 'transport' THEN 'Transport & Parkir'
  ELSE name
END,
  pct=CASE lower(trim(name))
    WHEN 'kontrakan / rumah' THEN 6
    WHEN 'makan harian' THEN 33
    WHEN 'kopi & jajan kerja' THEN 3
    WHEN 'belanja bulanan' THEN 6
    WHEN 'pendidikan' THEN 6
    WHEN 'transport' THEN 5
    WHEN 'transport & parkir' THEN 5
    WHEN 'tagihan & utilitas' THEN 7
    WHEN 'kesehatan' THEN 3
    WHEN 'dana darurat' THEN 10
    WHEN 'target rumah' THEN 8
    WHEN 'target mobil' THEN 5
    WHEN 'target umroh' THEN 4
    WHEN 'lifestyle' THEN 4
    ELSE pct
  END
WHERE household_id IN (SELECT household_id FROM budget_revision_0004_households);

UPDATE categories
SET sort_order=CASE lower(trim(name))
  WHEN 'kontrakan / rumah' THEN 0
  WHEN 'makan harian' THEN 1
  WHEN 'kopi & jajan kerja' THEN 2
  WHEN 'belanja bulanan' THEN 3
  WHEN 'pendidikan' THEN 4
  WHEN 'transport & parkir' THEN 5
  WHEN 'tagihan & utilitas' THEN 6
  WHEN 'kesehatan' THEN 7
  WHEN 'dana darurat' THEN 8
  WHEN 'target rumah' THEN 9
  WHEN 'target mobil' THEN 10
  WHEN 'target umroh' THEN 11
  WHEN 'lifestyle' THEN 12
  ELSE sort_order
END
WHERE household_id IN (SELECT household_id FROM budget_revision_0004_households);

DROP TABLE budget_revision_0004_households;
