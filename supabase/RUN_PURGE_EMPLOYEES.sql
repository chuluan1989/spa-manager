-- Xóa nhân viên rác + Mỹ Thanh (chạy trong Supabase SQL Editor)
-- Employee ID Mỹ Thanh: 96f4db26-9194-43e5-a6e1-d8e03fd398e7

DO $$
DECLARE
  emp RECORD;
  cred_payload JSONB;
  cred_employees JSONB;
BEGIN
  FOR emp IN
    SELECT id, name
    FROM employees
    WHERE id = '96f4db26-9194-43e5-a6e1-d8e03fd398e7'
       OR name ~ '^__SUPA_VERIFY_'
       OR lower(name) = lower('Mỹ Thanh')
  LOOP
    RAISE NOTICE 'Deleting employee % (%)', emp.name, emp.id;

    SELECT payload INTO cred_payload
    FROM app_credentials
    WHERE id = 'default'
    LIMIT 1;

    IF cred_payload IS NOT NULL AND cred_payload ? 'employees' THEN
      cred_employees := cred_payload -> 'employees';
      cred_employees := cred_employees - emp.id::text;
      cred_payload := jsonb_set(cred_payload, '{employees}', cred_employees, true);

      UPDATE app_credentials
      SET payload = cred_payload,
          updated_at = now()
      WHERE id = 'default';
    END IF;

    DELETE FROM employees WHERE id = emp.id;
  END LOOP;
END $$;
