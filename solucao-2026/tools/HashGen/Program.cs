var password = args.Length > 0 ? args[0] : "123456";
var workFactor = args.Length > 1 ? int.Parse(args[1]) : 11;
Console.WriteLine(BCrypt.Net.BCrypt.HashPassword(password, workFactor));
