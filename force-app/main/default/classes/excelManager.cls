public with sharing class excelManager {
    public excelManager() {
    }

    @AuraEnabled
    public static Solicitud__c createSolicitudFromExcel(String data) {
     try{
            Solicitud__c s = new Solicitud__c ();
            s.Estado__c = 'Iniciada';
            s.Tipo__c = 'Pre referenciamiento';
            s.Proveedor__c = '0012X0000219krBQAQ';
            insert s;
            
            List<String> lines = data.split(']');
            integer i = 0;
            for (String line : lines){
                i++;
                if (i > 2 ) {
                    if (line.startsWith(',['))
                        line = line.substringAfter(',[');
                    Linea__c l = new Linea__c ();
                    l.Texto_Linea__c = line;
                    l.Solicitud__c = s.Id;
                    insert l;
                }
            }

           ValidateSolicitud__e valSolicitud = new ValidateSolicitud__e(
            IdSolicitud__c=s.Id);
           Database.SaveResult sr = EventBus.publish(valSolicitud);

           return s;       
        }
        catch(Exception ex) {
            throw new AuraHandledException(ex.getMessage());
        }

    }

    @InvocableMethod
    public static void validateFichero(List<String> IdFichero) {
     try{
        String id = IdFichero[0];
        List<String> errores = new List<String>();

       // for(Solicitud__c f :[SELECT Tipo__c, Solicitud__c, (SELECT Id, Texto_Linea__c, Validate__c FROM Lineas__r ) FROM Fichero__c where Id=:id] ){
        for( Solicitud__c s : [SELECT Id, Name, Estado__c, Tipo__c, (SELECT Id, Texto_Linea__c, Validate__c FROM Lineas__r ) FROM Solicitud__c where Id = :id] ){
            s.Estado__c = 'En Validación';
            update s;
            try{
                integer indLine = 1;
            for(Linea__c l: s.Lineas__r){
                List<String> campos = l.Texto_Linea__c.split(',');
                integer index = 1;

                for (String campo: campos){
                campo = campo.remove('"');
                Regla__c [] regla = [SELECT id, Name, Longitud_Maxima__c, Longitud_Minima__c, Num_Campo__c, Patron__c, Requerido__c, Tipo_Campo__c from Regla__c where Tipo_Documento__c = :s.Tipo__c and Num_Campo__c = :index];

               if (regla.size() > 0){
                if (regla[0].Requerido__c && campo == null) {
                    errores.add('Linea ' + indLine + ' - El campo ' + regla[0].Name + ' es obligatorio');
                }
                if (regla[0].Tipo_Campo__c == 'Numero' && !campo.isNumeric()){
                    errores.add('Linea ' + indLine + ' - El campo ' + regla[0].Name + ' debe ser numérico');
                }
                if (regla[0].Longitud_Maxima__c != null && campo.length() > regla[0].Longitud_Maxima__c) {
                    errores.add('Linea ' + indLine + ' - La longitud del campo ' + regla[0].Name + ' es mayor de ' + regla[0].Longitud_Maxima__c);
                }
                if (regla[0].Longitud_Minima__c != null && campo.length() < regla[0].Longitud_Minima__c) {
                    errores.add('Linea ' + indLine + ' - La longitud del campo ' + regla[0].Name + ' es menor de ' + regla[0].Longitud_Minima__c);
                }
                if (regla[0].Patron__c != null && !regla[0].Patron__c.contains(campo)){
                    errores.add('Linea ' + indLine + ' - El valor del campo ' + regla[0].Name + ' no es válido ' + campo + '. Los valores válidos son ' + regla[0].Patron__c);
                }
                }
                index ++;
                }
                l.Validate__c = true;
                update l;
                indLine ++;
            }
            
            if (errores.size() > 0){
                s.Errores__c = String.join(errores, '\n');
                s.Estado__c = 'Con Errores';
                update s;
            }
            else {
                s.Estado__c = 'Validada';
                //Crear Productos
                for(Linea__c l: s.Lineas__r){
                    List<String> campos = l.Texto_Linea__c.split(',');
                    Producto__c p = new Producto__c();
                    p.Name = campos[7].remove('"');
                    p.Seccion__c = campos[2].remove('"');
                    p.Subseccion__c = campos[3].remove('"');
                    p.Codigo_EAN__c = campos[4].remove('"');
                    p.Numero_Modelo__c = campos[6].remove('"');
                    p.Nombre_Modelo__c = campos[7].remove('"');
                    p.Designacion_Corta__c = campos[8].remove('"');
                    if (campos[10] == '"Sí"') p.Contiene_Madera__c = true;
                    else p.Contiene_Madera__c = false;
                    p.Unidad_de_Medida__c = campos[11].remove('"');
                    p.Precio_Venta__c = Integer.valueOf(campos[12].remove('"'));
                    p.Solicitud__c = s.Id;
                    insert p;
                }
                update s;
            }
            delete s.Lineas__r;

        }
        catch (Exception ex){
            s.Errores__c = 'ERROR ' + ex.getMessage();
            update s;
        }
        }
        }
        catch(Exception ex) {

            throw new AuraHandledException(ex.getMessage());
        }

    }

   

    @AuraEnabled
    public static ContentVersion saveFileToSolicitud(Id parentId, String fileName, String base64Data) { 
        base64Data = EncodingUtil.urlDecode(base64Data, 'UTF-8');
        
        ContentVersion cv = new ContentVersion();
        cv.ContentLocation = 'S';
        cv.ContentDocumentId = NULL;
        cv.VersionData = EncodingUtil.base64Decode(base64Data);
        cv.Title = fileName;
        cv.PathOnClient = filename;
        
        insert cv;
        
        //***This DEBUG statement must return an Id for the rest of the code to work***
        System.debug('contentDocumentId='+cv.ContentDocumentId);               
        
        ContentDocumentLink cdl = new ContentDocumentLink();
        cdl.ContentDocumentId = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id =: cv.Id].ContentDocumentId;
        cdl.LinkedEntityId = parentId;
        cdl.ShareType = 'I';
        insert cdl;
        
        
        return cv;
    }
    

}
