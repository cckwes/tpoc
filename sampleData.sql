CREATE TABLE IF NOT EXISTS public.employee (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), 
  wallet_address VARCHAR(45)
)

CREATE TABLE IF NOT EXISTS public.idempotency (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), 
  idempotent_key VARCHAR(100) UNIQUE
)

CREATE TABLE IF NOT EXISTS public.transfer (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), 
  destination_address VARCHAR(45) NOT NULL, 
  transaction_hash VARCHAR(100), 
  amount BIGINT NOT NULL, 
  status VARCHAR(20) NOT NULL, 
  employee_id UUID NOT NULL, 
  created_at TIMESTAMP NOT NULL, 
  CONSTRAINT FK_Transfer_Employee FOREIGN KEY(employee_id) REFERENCES employee(id) ON DELETE 
  set 
    null
)

INSERT INTO public.employee(id, wallet_address) 
VALUES 
  (
    '6959b156-8232-4f36-afc0-c18a6815c3c5', 
    '0x45C71BFfa3fF3440B298201086f59ECFDE5b02B2'
  )

INSERT INTO public.employee(id, wallet_address) 
VALUES 
  (
    '7d4ef7ed-5afe-4083-ba50-a6773631990e', 
    '0x9FfE4Af2D769668cd2FBB462e2060ccCdf3D3945'
  )
