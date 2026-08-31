-- BASELINE SNAPSHOT — generado con `supabase db dump --linked --schema public` el 2026-08-31.
-- Representa el schema real de producción (proyecto vjgdtxryudoscumwsjhs) tal como estaba
-- antes de esta ronda de cambios. Reemplaza al histórico "supabase-schema.sql" desactualizado.
-- Ya está marcado como aplicado en el historial de migraciones (migration repair --status applied).
-- NO ejecutar a mano contra producción — es documentación versionada del estado ya existente.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'barber'
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_branch_access"("branch" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_branch_access
    WHERE user_id = auth.uid() AND branch_id = branch
  );
$$;


ALTER FUNCTION "public"."has_branch_access"("branch" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_anywhere"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_branch_access
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin_anywhere"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_branch_admin"("branch" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_branch_access
    WHERE user_id = auth.uid() AND branch_id = branch AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_branch_admin"("branch" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."branches" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_settings" (
    "id" smallint DEFAULT 1 NOT NULL,
    "commissions_enabled" boolean DEFAULT false NOT NULL,
    "default_commission_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "split_payment_enabled" boolean DEFAULT false NOT NULL,
    "mandatory_arqueo_enabled" boolean DEFAULT false NOT NULL,
    "inventory_enabled" boolean DEFAULT false NOT NULL,
    "services_label" "text" DEFAULT 'Servicios'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "brand_color" "text" DEFAULT 'slate'::"text" NOT NULL,
    CONSTRAINT "business_settings_default_commission_pct_check" CHECK ((("default_commission_pct" >= (0)::numeric) AND ("default_commission_pct" <= (100)::numeric))),
    CONSTRAINT "business_settings_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."business_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_closings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "closed_by" "uuid" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "closed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "arqueo_enabled" boolean NOT NULL,
    "calculated_efectivo" integer DEFAULT 0 NOT NULL,
    "calculated_transferencia" integer DEFAULT 0 NOT NULL,
    "calculated_pos" integer DEFAULT 0 NOT NULL,
    "calculated_total" integer DEFAULT 0 NOT NULL,
    "counted_efectivo" integer,
    "counted_transferencia" integer,
    "counted_pos" integer,
    "discrepancy_efectivo" integer,
    "discrepancy_transferencia" integer,
    "discrepancy_pos" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cash_closings_counted_required_when_arqueo_enabled" CHECK (((NOT "arqueo_enabled") OR (("counted_efectivo" IS NOT NULL) AND ("counted_transferencia" IS NOT NULL) AND ("counted_pos" IS NOT NULL))))
);


ALTER TABLE "public"."cash_closings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message" "text" NOT NULL,
    "stack" "text",
    "url" "text",
    "user_agent" "text",
    "user_id" "uuid",
    "branch_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_errors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "full_name" "text" NOT NULL,
    "ci" "text",
    "phone" "text",
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."movements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "type" "text" NOT NULL,
    "amount_charged" integer,
    "income" integer DEFAULT 0,
    "expense" integer DEFAULT 0,
    "payment_method" "text",
    "contact_id" "uuid",
    "service_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "branch_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "commission_pct" numeric(5,2),
    CONSTRAINT "movements_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['efectivo'::"text", 'transferencia'::"text", 'pos'::"text"]))),
    CONSTRAINT "movements_type_check" CHECK (("type" = ANY (ARRAY['servicio'::"text", 'gasto'::"text", 'apertura'::"text", 'cierre'::"text"])))
);


ALTER TABLE "public"."movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "text" DEFAULT 'barber'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'barber'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "price" integer NOT NULL,
    "branch_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "cost" integer DEFAULT 0
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_branch_access" (
    "user_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'barber'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_branch_access_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'barber'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."user_branch_access" OWNER TO "postgres";


ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_settings"
    ADD CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_closings"
    ADD CONSTRAINT "cash_closings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_errors"
    ADD CONSTRAINT "client_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movements"
    ADD CONSTRAINT "movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_branch_access"
    ADD CONSTRAINT "user_branch_access_pkey" PRIMARY KEY ("user_id", "branch_id");



CREATE INDEX "cash_closings_branch_closed_at_idx" ON "public"."cash_closings" USING "btree" ("branch_id", "closed_at" DESC);



CREATE INDEX "idx_client_errors_created_at" ON "public"."client_errors" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_contacts_name" ON "public"."contacts" USING "btree" ("full_name");



CREATE INDEX "idx_movements_branch_id" ON "public"."movements" USING "btree" ("branch_id");



CREATE INDEX "idx_movements_created_at" ON "public"."movements" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_movements_payment_method" ON "public"."movements" USING "btree" ("payment_method");



CREATE INDEX "idx_movements_type" ON "public"."movements" USING "btree" ("type");



CREATE INDEX "idx_movements_user_id" ON "public"."movements" USING "btree" ("user_id");



CREATE INDEX "idx_services_branch_id" ON "public"."services" USING "btree" ("branch_id");



CREATE INDEX "idx_user_branch_access_branch" ON "public"."user_branch_access" USING "btree" ("branch_id");



CREATE INDEX "idx_user_branch_access_user" ON "public"."user_branch_access" USING "btree" ("user_id");



ALTER TABLE ONLY "public"."business_settings"
    ADD CONSTRAINT "business_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."cash_closings"
    ADD CONSTRAINT "cash_closings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."cash_closings"
    ADD CONSTRAINT "cash_closings_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."client_errors"
    ADD CONSTRAINT "client_errors_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_errors"
    ADD CONSTRAINT "client_errors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."movements"
    ADD CONSTRAINT "movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."movements"
    ADD CONSTRAINT "movements_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."movements"
    ADD CONSTRAINT "movements_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."movements"
    ADD CONSTRAINT "movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."user_branch_access"
    ADD CONSTRAINT "user_branch_access_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_branch_access"
    ADD CONSTRAINT "user_branch_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."branches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "branches_delete_admin" ON "public"."branches" FOR DELETE USING ("public"."is_branch_admin"("id"));



CREATE POLICY "branches_insert_authenticated" ON "public"."branches" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "branches_select" ON "public"."branches" FOR SELECT USING ("public"."has_branch_access"("id"));



CREATE POLICY "branches_update_admin" ON "public"."branches" FOR UPDATE USING ("public"."is_branch_admin"("id"));



ALTER TABLE "public"."business_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_settings_select" ON "public"."business_settings" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "business_settings_update_admin" ON "public"."business_settings" FOR UPDATE USING ("public"."is_admin_anywhere"()) WITH CHECK ("public"."is_admin_anywhere"());



ALTER TABLE "public"."cash_closings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cash_closings_insert" ON "public"."cash_closings" FOR INSERT WITH CHECK ((("closed_by" = "auth"."uid"()) AND "public"."is_branch_admin"("branch_id")));



CREATE POLICY "cash_closings_select" ON "public"."cash_closings" FOR SELECT USING (("public"."is_branch_admin"("branch_id") OR (("closed_by" = "auth"."uid"()) AND "public"."has_branch_access"("branch_id"))));



ALTER TABLE "public"."client_errors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_errors_insert_any" ON "public"."client_errors" FOR INSERT WITH CHECK (true);



CREATE POLICY "client_errors_select_admin" ON "public"."client_errors" FOR SELECT USING ("public"."is_admin_anywhere"());



ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contacts_delete_authenticated" ON "public"."contacts" FOR DELETE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "contacts_insert_authenticated" ON "public"."contacts" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "contacts_select_authenticated" ON "public"."contacts" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "contacts_update_authenticated" ON "public"."contacts" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "movements_insert" ON "public"."movements" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."has_branch_access"("branch_id") AND (("type" <> ALL (ARRAY['apertura'::"text", 'cierre'::"text"])) OR "public"."is_branch_admin"("branch_id"))));



CREATE POLICY "movements_select" ON "public"."movements" FOR SELECT USING (("public"."is_branch_admin"("branch_id") OR (("user_id" = "auth"."uid"()) AND "public"."has_branch_access"("branch_id"))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_all" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "services_admin_delete" ON "public"."services" FOR DELETE USING ("public"."is_admin_anywhere"());



CREATE POLICY "services_admin_insert" ON "public"."services" FOR INSERT WITH CHECK ("public"."is_admin_anywhere"());



CREATE POLICY "services_admin_update" ON "public"."services" FOR UPDATE USING ("public"."is_admin_anywhere"());



CREATE POLICY "services_select_all" ON "public"."services" FOR SELECT USING (true);



CREATE POLICY "uba_delete_admin" ON "public"."user_branch_access" FOR DELETE USING ("public"."is_branch_admin"("branch_id"));



CREATE POLICY "uba_insert" ON "public"."user_branch_access" FOR INSERT WITH CHECK (("public"."is_branch_admin"("branch_id") OR (("user_id" = "auth"."uid"()) AND ("role" = 'admin'::"text") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."user_branch_access" "existing"
  WHERE (("existing"."branch_id" = "user_branch_access"."branch_id") AND ("existing"."role" = 'admin'::"text"))))))));



CREATE POLICY "uba_select" ON "public"."user_branch_access" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_branch_admin"("branch_id")));



CREATE POLICY "uba_update_admin" ON "public"."user_branch_access" FOR UPDATE USING ("public"."is_branch_admin"("branch_id"));



ALTER TABLE "public"."user_branch_access" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_branch_access"("branch" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_branch_access"("branch" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_branch_access"("branch" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin_anywhere"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin_anywhere"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_anywhere"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_branch_admin"("branch" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_branch_admin"("branch" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_branch_admin"("branch" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."branches" TO "anon";
GRANT ALL ON TABLE "public"."branches" TO "authenticated";
GRANT ALL ON TABLE "public"."branches" TO "service_role";



GRANT ALL ON TABLE "public"."business_settings" TO "anon";
GRANT ALL ON TABLE "public"."business_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."business_settings" TO "service_role";



GRANT ALL ON TABLE "public"."cash_closings" TO "anon";
GRANT ALL ON TABLE "public"."cash_closings" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_closings" TO "service_role";



GRANT ALL ON TABLE "public"."client_errors" TO "anon";
GRANT ALL ON TABLE "public"."client_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."client_errors" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."movements" TO "anon";
GRANT ALL ON TABLE "public"."movements" TO "authenticated";
GRANT ALL ON TABLE "public"."movements" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."user_branch_access" TO "anon";
GRANT ALL ON TABLE "public"."user_branch_access" TO "authenticated";
GRANT ALL ON TABLE "public"."user_branch_access" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







