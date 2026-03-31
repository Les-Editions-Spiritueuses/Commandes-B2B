export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type RegimeFiscal = "DROITS_ACQUITTES" | "DROITS_SUSPENDUS";
export type StatutCompte = "ACTIF" | "EN_ATTENTE" | "INACTIF";
export type CategorieFiscale = "ALCOOL" | "RHUM_DOM" | "ABV";
export type TypeProforma = "ACQUITTES" | "SUSPENDUS";
export type StatutCommande = "BROUILLON" | "VALIDEE" | "ANNULEE";

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: number;
          code_client: string;
          raison_sociale: string;
          contact: string | null;
          regime_fiscal: RegimeFiscal;
          remise_particuliere: string;
          adresse_ligne_1: string | null;
          adresse_ligne_2: string | null;
          code_postal: string | null;
          ville: string | null;
          pays: string;
          email: string | null;
          telephone: string | null;
          siret: string | null;
          tva_intracom: string | null;
          iban: string | null;
          notes: string | null;
          livraison_diff: boolean;
          livraison_nom: string | null;
          livraison_adresse_ligne_1: string | null;
          livraison_adresse_ligne_2: string | null;
          livraison_code_postal: string | null;
          livraison_ville: string | null;
          livraison_pays: string | null;
          statut_compte: StatutCompte;
          date_creation: string;
        };
        Insert: {
          id?: number;
          code_client: string;
          raison_sociale: string;
          contact?: string | null;
          regime_fiscal: RegimeFiscal;
          remise_particuliere?: string;
          adresse_ligne_1?: string | null;
          adresse_ligne_2?: string | null;
          code_postal?: string | null;
          ville?: string | null;
          pays?: string;
          email?: string | null;
          telephone?: string | null;
          siret?: string | null;
          tva_intracom?: string | null;
          iban?: string | null;
          notes?: string | null;
          livraison_diff?: boolean;
          livraison_nom?: string | null;
          livraison_adresse_ligne_1?: string | null;
          livraison_adresse_ligne_2?: string | null;
          livraison_code_postal?: string | null;
          livraison_ville?: string | null;
          livraison_pays?: string | null;
          statut_compte?: StatutCompte;
          date_creation?: string;
        };
        Update: {
          id?: number;
          code_client?: string;
          raison_sociale?: string;
          contact?: string | null;
          regime_fiscal?: RegimeFiscal;
          remise_particuliere?: string;
          adresse_ligne_1?: string | null;
          adresse_ligne_2?: string | null;
          code_postal?: string | null;
          ville?: string | null;
          pays?: string;
          email?: string | null;
          telephone?: string | null;
          siret?: string | null;
          tva_intracom?: string | null;
          iban?: string | null;
          notes?: string | null;
          livraison_diff?: boolean;
          livraison_nom?: string | null;
          livraison_adresse_ligne_1?: string | null;
          livraison_adresse_ligne_2?: string | null;
          livraison_code_postal?: string | null;
          livraison_ville?: string | null;
          livraison_pays?: string | null;
          statut_compte?: StatutCompte;
          date_creation?: string;
        };
        Relationships: [];
      };

      produits: {
        Row: {
          id: number;
          code_produit: string;
          libelle: string;
          categorie_fiscale: CategorieFiscale;
          alcool_vol: string;
          volume_l: string;
          tarif_base_ht: string;
          remise_coffret: string;
          actif: boolean;
          ordre_affichage: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          code_produit: string;
          libelle: string;
          categorie_fiscale: CategorieFiscale;
          alcool_vol?: string;
          volume_l?: string;
          tarif_base_ht?: string;
          remise_coffret?: string;
          actif?: boolean;
          ordre_affichage?: number;
          created_at?: string;
        };
        Update: {
          id?: number;
          code_produit?: string;
          libelle?: string;
          categorie_fiscale?: CategorieFiscale;
          alcool_vol?: string;
          volume_l?: string;
          tarif_base_ht?: string;
          remise_coffret?: string;
          actif?: boolean;
          ordre_affichage?: number;
          created_at?: string;
        };
        Relationships: [];
      };

      parametres_fiscaux: {
        Row: {
          id: number;
          taux_droits_alcool: string;
          taux_vignette_alcool: string;
          taux_droits_rhum_dom: string;
          taux_vignette_rhum_dom: string;
          taux_droits_abv: string;
          taux_vignette_abv: string;
          taux_tva: string;
          remise_fixe_pro: string;
          actif: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          taux_droits_alcool?: string;
          taux_vignette_alcool?: string;
          taux_droits_rhum_dom?: string;
          taux_vignette_rhum_dom?: string;
          taux_droits_abv?: string;
          taux_vignette_abv?: string;
          taux_tva?: string;
          remise_fixe_pro?: string;
          actif?: boolean;
          created_at?: string;
        };
        Update: {
          id?: number;
          taux_droits_alcool?: string;
          taux_vignette_alcool?: string;
          taux_droits_rhum_dom?: string;
          taux_vignette_rhum_dom?: string;
          taux_droits_abv?: string;
          taux_vignette_abv?: string;
          taux_tva?: string;
          remise_fixe_pro?: string;
          actif?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };

      paliers_remise: {
        Row: {
          id: number;
          nom_palier: string;
          qte_min: number;
          qte_max: number;
          taux_remise: string;
          ordre: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          nom_palier: string;
          qte_min: number;
          qte_max: number;
          taux_remise?: string;
          ordre?: number;
          created_at?: string;
        };
        Update: {
          id?: number;
          nom_palier?: string;
          qte_min?: number;
          qte_max?: number;
          taux_remise?: string;
          ordre?: number;
          created_at?: string;
        };
        Relationships: [];
      };

      tranches_expedition: {
        Row: {
          id: number;
          nom_tranche: string;
          qte_min: number;
          qte_max: number;
          frais_ttc: string;
          ordre: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          nom_tranche: string;
          qte_min: number;
          qte_max: number;
          frais_ttc?: string;
          ordre?: number;
          created_at?: string;
        };
        Update: {
          id?: number;
          nom_tranche?: string;
          qte_min?: number;
          qte_max?: number;
          frais_ttc?: string;
          ordre?: number;
          created_at?: string;
        };
        Relationships: [];
      };

      commandes: {
        Row: {
          id: number;
          numero_commande: string | null;
          numero_proforma: string | null;
          code_client: string;
          client_raison_sociale: string;
          client_contact: string | null;
          client_email: string | null;
          client_telephone: string | null;
          client_siret: string | null;
          client_tva_intracom: string | null;
          client_iban: string | null;
          client_regime_fiscal: RegimeFiscal;
          facturation_adresse_ligne_1: string | null;
          facturation_adresse_ligne_2: string | null;
          facturation_code_postal: string | null;
          facturation_ville: string | null;
          facturation_pays: string | null;
          livraison_diff: boolean;
          livraison_nom: string | null;
          livraison_adresse_ligne_1: string | null;
          livraison_adresse_ligne_2: string | null;
          livraison_code_postal: string | null;
          livraison_ville: string | null;
          livraison_pays: string | null;
          total_quantite: number;
          remise_palier_appliquee: string;
          frais_expedition_ttc: string;
          montant_ht_remise: string;
          montant_droits: string;
          montant_ht_acquitte: string;
          montant_tva: string;
          montant_ttc: string;
          type_proforma: TypeProforma;
          statut: StatutCommande;
          date_creation: string;
          date_echeance: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          numero_commande?: string | null;
          numero_proforma?: string | null;
          code_client: string;
          client_raison_sociale: string;
          client_contact?: string | null;
          client_email?: string | null;
          client_telephone?: string | null;
          client_siret?: string | null;
          client_tva_intracom?: string | null;
          client_iban?: string | null;
          client_regime_fiscal: RegimeFiscal;
          facturation_adresse_ligne_1?: string | null;
          facturation_adresse_ligne_2?: string | null;
          facturation_code_postal?: string | null;
          facturation_ville?: string | null;
          facturation_pays?: string | null;
          livraison_diff?: boolean;
          livraison_nom?: string | null;
          livraison_adresse_ligne_1?: string | null;
          livraison_adresse_ligne_2?: string | null;
          livraison_code_postal?: string | null;
          livraison_ville?: string | null;
          livraison_pays?: string | null;
          total_quantite?: number;
          remise_palier_appliquee?: string;
          frais_expedition_ttc?: string;
          montant_ht_remise?: string;
          montant_droits?: string;
          montant_ht_acquitte?: string;
          montant_tva?: string;
          montant_ttc?: string;
          type_proforma: TypeProforma;
          statut?: StatutCommande;
          date_creation?: string;
          date_echeance?: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          numero_commande?: string | null;
          numero_proforma?: string | null;
          code_client?: string;
          client_raison_sociale?: string;
          client_contact?: string | null;
          client_email?: string | null;
          client_telephone?: string | null;
          client_siret?: string | null;
          client_tva_intracom?: string | null;
          client_iban?: string | null;
          client_regime_fiscal?: RegimeFiscal;
          facturation_adresse_ligne_1?: string | null;
          facturation_adresse_ligne_2?: string | null;
          facturation_code_postal?: string | null;
          facturation_ville?: string | null;
          facturation_pays?: string | null;
          livraison_diff?: boolean;
          livraison_nom?: string | null;
          livraison_adresse_ligne_1?: string | null;
          livraison_adresse_ligne_2?: string | null;
          livraison_code_postal?: string | null;
          livraison_ville?: string | null;
          livraison_pays?: string | null;
          total_quantite?: number;
          remise_palier_appliquee?: string;
          frais_expedition_ttc?: string;
          montant_ht_remise?: string;
          montant_droits?: string;
          montant_ht_acquitte?: string;
          montant_tva?: string;
          montant_ttc?: string;
          type_proforma?: TypeProforma;
          statut?: StatutCommande;
          date_creation?: string;
          date_echeance?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commandes_code_client_fkey";
            columns: ["code_client"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["code_client"];
          }
        ];
      };

      lignes_commande: {
        Row: {
          id: number;
          commande_id: number;
          produit_code: string;
          produit_libelle: string;
          categorie_fiscale: CategorieFiscale;
          alcool_vol: string;
          volume_l: string;
          quantite: number;
          tarif_base_ht: string;
          remise_a: string;
          remise_b: string;
          remise_c: string;
          remise_d: string;
          prix_unitaire_remise_ht: string;
          total_ht_ligne: string;
          droits_ligne: string;
          tva_ligne: string;
          total_ttc_ligne: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          commande_id: number;
          produit_code: string;
          produit_libelle: string;
          categorie_fiscale: CategorieFiscale;
          alcool_vol?: string;
          volume_l?: string;
          quantite: number;
          tarif_base_ht?: string;
          remise_a?: string;
          remise_b?: string;
          remise_c?: string;
          remise_d?: string;
          prix_unitaire_remise_ht?: string;
          total_ht_ligne?: string;
          droits_ligne?: string;
          tva_ligne?: string;
          total_ttc_ligne?: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          commande_id?: number;
          produit_code?: string;
          produit_libelle?: string;
          categorie_fiscale?: CategorieFiscale;
          alcool_vol?: string;
          volume_l?: string;
          quantite?: number;
          tarif_base_ht?: string;
          remise_a?: string;
          remise_b?: string;
          remise_c?: string;
          remise_d?: string;
          prix_unitaire_remise_ht?: string;
          total_ht_ligne?: string;
          droits_ligne?: string;
          tva_ligne?: string;
          total_ttc_ligne?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lignes_commande_commande_id_fkey";
            columns: ["commande_id"];
            isOneToOne: false;
            referencedRelation: "commandes";
            referencedColumns: ["id"];
          }
        ];
      };
    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      commandes_set_numeros_before_insert: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
    };

    Enums: {
      [_ in never]: never;
    };

    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Inserts<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type Updates<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Client = Tables<"clients">;
export type Produit = Tables<"produits">;
export type ParametresFiscaux = Tables<"parametres_fiscaux">;
export type PalierRemise = Tables<"paliers_remise">;
export type TrancheExpedition = Tables<"tranches_expedition">;
export type Commande = Tables<"commandes">;
export type LigneCommande = Tables<"lignes_commande">;
