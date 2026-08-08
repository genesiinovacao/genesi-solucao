using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Models.Entities;

namespace Solucao.Backend.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleItem> SaleItems => Set<SaleItem>();
    public DbSet<SalePayment> SalePayments => Set<SalePayment>();
    public DbSet<SaleReturn> SaleReturns => Set<SaleReturn>();
    public DbSet<SaleReturnItem> SaleReturnItems => Set<SaleReturnItem>();
    public DbSet<Quote> Quotes => Set<Quote>();
    public DbSet<QuoteItem> QuoteItems => Set<QuoteItem>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<FinancialTransaction> FinancialTransactions => Set<FinancialTransaction>();
    public DbSet<Promotion> Promotions => Set<Promotion>();
    public DbSet<DeliveryOrder> DeliveryOrders => Set<DeliveryOrder>();
    public DbSet<CashSession> CashSessions => Set<CashSession>();
    public DbSet<CashMovement> CashMovements => Set<CashMovement>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<FiscalDocument> FiscalDocuments => Set<FiscalDocument>();
    public DbSet<PosTerminal> PosTerminals => Set<PosTerminal>();
    public DbSet<PlatformSettings> PlatformSettings => Set<PlatformSettings>();
    public DbSet<BillingCharge> BillingCharges => Set<BillingCharge>();
    public DbSet<TenantGroup> TenantGroups => Set<TenantGroup>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // Map all entity properties to snake_case columns/tables matching schema.sql
        b.UseSnakeCaseNames();

        b.Entity<Tenant>(e =>
        {
            e.ToTable("tenants");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.Email).HasColumnType("citext");
            e.Property(x => x.DailySalesTarget).HasColumnType("decimal(15,2)");
            e.HasIndex(x => x.Cnpj).IsUnique();
        });

        b.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.Email).HasColumnType("citext");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
            e.HasIndex(x => new { x.TenantId, x.Email }).IsUnique();
        });

        b.Entity<TenantGroup>(e =>
        {
            e.ToTable("tenant_groups");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        });

        b.Entity<BillingCharge>(e =>
        {
            e.ToTable("billing_charges");
            e.HasKey(x => x.Id);
            e.Property(x => x.Amount).HasColumnType("decimal(12,2)");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            // Nomes explícitos: a convenção snake_case geraria pro_rata_days
            e.Property(x => x.ProRataDays).HasColumnName("prorata_days");
            e.Property(x => x.ProRataAmount).HasColumnName("prorata_amount").HasColumnType("decimal(12,2)");
            e.HasIndex(x => new { x.TenantId, x.CreatedAt });
        });

        b.Entity<RefreshToken>(e =>
        {
            e.ToTable("refresh_tokens");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        });

        b.Entity<Supplier>(e =>
        {
            e.ToTable("suppliers");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.Email).HasColumnType("citext");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        });

        b.Entity<Product>(e =>
        {
            e.ToTable("products");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
            e.HasIndex(x => new { x.TenantId, x.Sku }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Barcode }).IsUnique();
            e.Property(x => x.CostPrice).HasColumnType("decimal(12,2)");
            e.Property(x => x.SalePrice).HasColumnType("decimal(12,2)");
            e.Property(x => x.StockQuantity).HasColumnType("decimal(12,3)");
            e.Property(x => x.MinStock).HasColumnType("decimal(12,3)");
        });

        b.Entity<Customer>(e =>
        {
            e.ToTable("customers");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.Email).HasColumnType("citext");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.TotalSpent).HasColumnType("decimal(15,2)");
            e.Property(x => x.CreditBalance).HasColumnType("decimal(15,2)");
        });

        b.Entity<Sale>(e =>
        {
            e.ToTable("sales");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.SaleDate).HasDefaultValueSql("now()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.Subtotal).HasColumnType("decimal(15,2)");
            e.Property(x => x.DiscountAmount).HasColumnType("decimal(15,2)");
            e.Property(x => x.TotalAmount).HasColumnType("decimal(15,2)");
            e.Property(x => x.AmountReceived).HasColumnType("decimal(15,2)");
            e.Property(x => x.ChangeAmount).HasColumnType("decimal(15,2)");
            e.HasIndex(x => x.OfflineSyncId).IsUnique();
            e.HasMany(x => x.Items).WithOne().HasForeignKey(x => x.SaleId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Payments).WithOne().HasForeignKey(x => x.SaleId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<SaleItem>(e =>
        {
            e.ToTable("sale_items");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.Quantity).HasColumnType("decimal(12,3)");
            e.Property(x => x.UnitPrice).HasColumnType("decimal(12,2)");
            e.Property(x => x.DiscountAmount).HasColumnType("decimal(12,2)");
            e.Property(x => x.TotalPrice).HasColumnType("decimal(12,2)");
        });

        b.Entity<SalePayment>(e =>
        {
            e.ToTable("sale_payments");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.Amount).HasColumnType("decimal(15,2)");
        });

        b.Entity<SaleReturn>(e =>
        {
            e.ToTable("sale_returns");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.TotalRefund).HasColumnType("decimal(15,2)");
            e.HasMany(x => x.Items).WithOne().HasForeignKey(x => x.SaleReturnId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<SaleReturnItem>(e =>
        {
            e.ToTable("sale_return_items");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.QuantityReturned).HasColumnType("decimal(12,3)");
            e.Property(x => x.UnitPrice).HasColumnType("decimal(12,2)");
            e.Property(x => x.RefundAmount).HasColumnType("decimal(15,2)");
        });

        b.Entity<Quote>(e =>
        {
            e.ToTable("quotes");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.Subtotal).HasColumnType("decimal(15,2)");
            e.Property(x => x.DiscountAmount).HasColumnType("decimal(15,2)");
            e.Property(x => x.SurchargeAmount).HasColumnType("decimal(15,2)");
            e.Property(x => x.TotalAmount).HasColumnType("decimal(15,2)");
            e.HasMany(x => x.Items).WithOne().HasForeignKey(x => x.QuoteId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<QuoteItem>(e =>
        {
            e.ToTable("quote_items");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.Quantity).HasColumnType("decimal(12,3)");
            e.Property(x => x.UnitPrice).HasColumnType("decimal(12,2)");
            e.Property(x => x.DiscountAmount).HasColumnType("decimal(12,2)");
            e.Property(x => x.TotalPrice).HasColumnType("decimal(12,2)");
        });

        b.Entity<StockMovement>(e =>
        {
            e.ToTable("stock_movements");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.Quantity).HasColumnType("decimal(12,3)");
            e.Property(x => x.BalanceAfter).HasColumnType("decimal(12,3)");
            e.Property(x => x.UnitCost).HasColumnType("decimal(12,2)");
        });

        b.Entity<FinancialTransaction>(e =>
        {
            e.ToTable("financial_transactions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.Amount).HasColumnType("decimal(15,2)");
        });

        b.Entity<Promotion>(e =>
        {
            e.ToTable("promotions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.DiscountPercent).HasColumnType("decimal(5,2)");
            e.Property(x => x.TotalSavings).HasColumnType("decimal(15,2)");
        });

        b.Entity<DeliveryOrder>(e =>
        {
            e.ToTable("delivery_orders");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.RequestedAt).HasDefaultValueSql("now()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.TotalAmount).HasColumnType("decimal(15,2)");
            e.Property(x => x.DeliveryFee).HasColumnType("decimal(15,2)");
            e.HasIndex(x => new { x.TenantId, x.OrderNumber }).IsUnique();
        });

        b.Entity<CashSession>(e =>
        {
            e.ToTable("cash_sessions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.OpenedAt).HasDefaultValueSql("now()");
            e.Property(x => x.OpeningAmount).HasColumnType("decimal(15,2)");
            e.Property(x => x.ClosingAmount).HasColumnType("decimal(15,2)");
            e.Property(x => x.ExpectedAmount).HasColumnType("decimal(15,2)");
            e.Property(x => x.Difference).HasColumnType("decimal(15,2)");
        });

        b.Entity<CashMovement>(e =>
        {
            e.ToTable("cash_movements");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.Amount).HasColumnType("decimal(15,2)");
        });

        b.Entity<AuditLog>(e =>
        {
            e.ToTable("audit_log");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.Metadata).HasColumnType("jsonb");
        });

        b.Entity<PosTerminal>(e =>
        {
            e.ToTable("pos_terminals");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.LastSeenAt).HasDefaultValueSql("now()");
            e.HasIndex(x => new { x.TenantId, x.TerminalKey }).IsUnique();
        });

        b.Entity<PlatformSettings>(e =>
        {
            e.ToTable("platform_settings");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).ValueGeneratedNever();
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        });

        b.Entity<FiscalDocument>(e =>
        {
            e.ToTable("fiscal_documents");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("uuid_generate_v4()");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
            e.HasIndex(x => new { x.TenantId, x.DocumentType, x.Series, x.Number }).IsUnique();
        });
    }
}

internal static class ModelBuilderExtensions
{
    /// <summary>
    /// Converts all PascalCase entity/property names to snake_case so EF Core
    /// matches the columns declared in 01_schema.sql.
    /// </summary>
    public static void UseSnakeCaseNames(this ModelBuilder builder)
    {
        foreach (var entity in builder.Model.GetEntityTypes())
        {
            var tableName = entity.GetTableName();
            if (tableName != null)
                entity.SetTableName(ToSnake(tableName));

            foreach (var p in entity.GetProperties())
                p.SetColumnName(ToSnake(p.GetColumnName()));

            foreach (var k in entity.GetKeys())
                k.SetName(ToSnake(k.GetName() ?? string.Empty));

            foreach (var fk in entity.GetForeignKeys())
                fk.SetConstraintName(ToSnake(fk.GetConstraintName() ?? string.Empty));

            foreach (var idx in entity.GetIndexes())
                idx.SetDatabaseName(ToSnake(idx.GetDatabaseName() ?? string.Empty));
        }
    }

    private static string ToSnake(string input)
    {
        if (string.IsNullOrEmpty(input)) return input;
        var sb = new System.Text.StringBuilder(input.Length + 8);
        for (int i = 0; i < input.Length; i++)
        {
            var c = input[i];
            if (char.IsUpper(c) && i > 0 && (char.IsLower(input[i - 1]) || (i + 1 < input.Length && char.IsLower(input[i + 1]))))
                sb.Append('_');
            sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString();
    }
}
